import {
  InvestmentStatus,
  PurchaseOrderStatus,
  PurchaseOrderStep,
  type PurchaseOrder,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { formatOrderResponse } from "@/services/funds/orders";
import type { FundsServiceResult } from "@/services/funds/estimate";
import { refreshWalletActivityForOrder } from "@/services/wallets/walletActivityRefresh";
import { logFundsEvent, logFundsRejected } from "./logging";

export const CANCEL_DISABLED = "CANCEL_DISABLED";
export const CANCEL_NOT_ALLOWED = "CANCEL_NOT_ALLOWED";
export const ALREADY_PROCESSING = "ALREADY_PROCESSING";

const CANCELLABLE_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.queued,
  PurchaseOrderStatus.processing,
];

/** True when no admin/on-chain work has started for this purchase order. */
export function isPurchaseOrderCancellable(
  order: Pick<
    PurchaseOrder,
    "status" | "topUpTxId" | "usdtTxId" | "sponsoredTrx"
  >
): boolean {
  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    return false;
  }
  if (order.topUpTxId || order.usdtTxId) {
    return false;
  }
  if ((order.sponsoredTrx ?? 0) > 0) {
    return false;
  }
  return true;
}

function cancelBlockedCode(
  order: Pick<
    PurchaseOrder,
    "status" | "topUpTxId" | "usdtTxId" | "sponsoredTrx"
  >
): typeof CANCEL_NOT_ALLOWED | typeof ALREADY_PROCESSING {
  if (order.topUpTxId || order.usdtTxId || (order.sponsoredTrx ?? 0) > 0) {
    return ALREADY_PROCESSING;
  }
  return CANCEL_NOT_ALLOWED;
}

export async function cancelPurchaseOrder(
  userId: string,
  orderId: string
): Promise<FundsServiceResult<ReturnType<typeof formatOrderResponse>>> {
  const logPrefix = { userId, orderId };

  if (getEnv().blockchainNetwork !== "testnet") {
    logFundsRejected("cancel", "not_testnet", logPrefix);
    return {
      ok: false,
      status: 403,
      body: {
        msg: "Cancelling investment orders is only available on testnet",
        code: CANCEL_DISABLED,
      },
    };
  }

  try {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
    });

    if (!order || order.userId !== userId) {
      logFundsRejected("cancel", "not_found", logPrefix);
      return { ok: false, status: 404, body: { msg: "Order not found" } };
    }

    if (!isPurchaseOrderCancellable(order)) {
      const code = cancelBlockedCode(order);
      logFundsRejected("cancel", "not_cancellable", {
        ...logPrefix,
        status: order.status,
        topUpTxId: order.topUpTxId,
        usdtTxId: order.usdtTxId,
        sponsoredTrx: order.sponsoredTrx,
        code,
      });
      return {
        ok: false,
        status: 400,
        body: {
          msg:
            code === ALREADY_PROCESSING
              ? "This order can no longer be cancelled because on-chain processing has started"
              : "This order cannot be cancelled",
          code,
        },
      };
    }

    if (order.investmentId) {
      const investment = await prisma.investment.findUnique({
        where: { id: order.investmentId },
      });
      if (investment && investment.status !== InvestmentStatus.pending) {
        logFundsRejected("cancel", "investment_active", {
          ...logPrefix,
          investmentId: investment.id,
          investmentStatus: investment.status,
        });
        return {
          ok: false,
          status: 400,
          body: {
            msg: "This order cannot be cancelled because the investment is already active",
            code: CANCEL_NOT_ALLOWED,
          },
        };
      }
      if (investment) {
        await prisma.investment.delete({ where: { id: investment.id } });
      }
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: PurchaseOrderStatus.cancelled,
        step: PurchaseOrderStep.done,
        failureReason: "user_cancelled",
        investmentId: null,
        paymentChainOutcome: null,
        paymentChainFinal: true,
        paymentChainCheckedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await refreshWalletActivityForOrder(updated).catch((err) => {
      console.error(
        "[wallet:activity] refresh after cancelPurchaseOrder failed",
        order.id,
        err instanceof Error ? err.message : err
      );
    });

    logFundsEvent("cancel", "info", "order cancelled by user", {
      ...logPrefix,
      fundId: updated.fundId,
    });

    return { ok: true, data: formatOrderResponse(updated) };
  } catch (err) {
    logFundsEvent("cancel", "error", "unexpected error", {
      ...logPrefix,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      status: 500,
      body: {
        msg: err instanceof Error ? err.message : "Internal Server Error",
      },
    };
  }
}
