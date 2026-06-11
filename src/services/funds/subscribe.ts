import {
  getFundById,
  getInvestmentAmountUsdt,
  isValidFundId,
  isValidInvestmentAmount,
} from "@/lib/config/pricing";
import { formatTronTransferError } from "@/lib/utils/tronErrors";
import { getMainWallet } from "@/lib/wallets/helpers";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { PurchaseOrderFulfillmentMode, PurchaseOrderStep } from "@prisma/client";
import { buildIndieFundrMemo } from "@/lib/tron/transactionMemo";
import * as tron from "@/services/tron/client";
import {
  getInvestmentSlotUsage,
  slotsFullResponseBody,
  totalInvestmentsCapResponseBody,
} from "@/lib/config/investmentSlots";
import {
  getActiveOrderForUser,
  getWalletUsdtAvailability,
} from "@/services/wallets/walletBalance";
import { formatOrderResponse } from "./orders";
import type { FundsServiceResult } from "./estimate";
import { logFundsEvent, logFundsRejected } from "./logging";

export async function subscribeToFund(
  userId: string,
  input: { fundId: string; cost: number; device?: string }
): Promise<FundsServiceResult<Record<string, unknown>>> {
  const logPrefix = "[subscribeToFund]";
  const { fundId, cost, device } = input;
  const baseFields = { userId, fundId, cost };

  if (!isValidFundId(fundId) || !isValidInvestmentAmount(Number(cost))) {
    logFundsRejected("subscribe", "invalid_input", {
      ...baseFields,
      expectedCost: getInvestmentAmountUsdt(),
      validFund: isValidFundId(fundId),
      validCost: isValidInvestmentAmount(Number(cost)),
    });
    return {
      ok: false,
      status: 400,
      body: { msg: "The provided values are not valid" },
    };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      logFundsRejected("subscribe", "user_not_found", baseFields);
      return {
        ok: false,
        status: 404,
        body: "User not found",
        plainText: true,
      };
    }

    const slotUsage = await getInvestmentSlotUsage(
      userId,
      fundId,
      undefined,
      user.level
    );
    if (slotUsage.totalSlotsAvailable <= 0) {
      logFundsRejected("subscribe", "total_investments_cap", {
        ...baseFields,
        totalOpenCount: slotUsage.totalOpenCount,
        maxTotalOpenInvestments: slotUsage.maxTotalOpenInvestments,
      });
      return {
        ok: false,
        status: 400,
        body: totalInvestmentsCapResponseBody(
          slotUsage.totalOpenCount,
          slotUsage.maxTotalOpenInvestments
        ),
      };
    }
    if (slotUsage.slotsAvailable <= 0) {
      logFundsRejected("subscribe", "slots_full", {
        ...baseFields,
        openCount: slotUsage.openCount,
        maxOpenInvestments: slotUsage.maxOpenInvestments,
      });
      return {
        ok: false,
        status: 400,
        body: slotsFullResponseBody(
          slotUsage.openCount,
          slotUsage.maxOpenInvestments
        ),
      };
    }

    const sender = await getMainWallet(userId);
    if (!sender) {
      logFundsRejected("subscribe", "wallet_not_found", baseFields);
      return { ok: false, status: 404, body: { msg: "Wallet not found" } };
    }

    const treasury = getEnv().treasuryAddress;
    if (!treasury) {
      logFundsRejected("subscribe", "treasury_not_configured", baseFields);
      return {
        ok: false,
        status: 500,
        body: { msg: "Treasury wallet is not configured" },
      };
    }

    if (!(await tron.validateAddress(sender.address))) {
      logFundsRejected("subscribe", "legacy_wallet_address", {
        ...baseFields,
        walletId: sender.id,
        address: sender.address,
      });
      return {
        ok: false,
        status: 400,
        body: {
          msg: "Wallet uses a legacy address format. Please add a new Tron wallet.",
        },
      };
    }

    const availability = await getWalletUsdtAvailability(sender);
    if (availability.availableUsdt < cost) {
      const earlyError = formatTronTransferError(
        { message: "insufficient usdt" },
        {
          fromAddress: sender.address,
          usdtBalance: availability.onChainUsdt,
          amountUsdt: cost,
        }
      );
      logFundsRejected("subscribe", "insufficient_usdt", {
        ...baseFields,
        walletId: sender.id,
        onChainUsdt: availability.onChainUsdt,
        availableUsdt: availability.availableUsdt,
        reservedUsdt: availability.reservedUsdt,
        pendingOrdersCount: availability.pendingOrdersCount,
        code: earlyError.code,
      });
      return { ok: false, status: 400, body: earlyError };
    }

    let feeEstimate;
    try {
      feeEstimate = await tron.estimateUsdtTransfer({
        fromAddress: sender.address,
        toAddress: treasury,
        amount: cost,
      });
    } catch (estimateError) {
      const body = formatTronTransferError(estimateError, {
        fromAddress: sender.address,
      });
      logFundsRejected("subscribe", "fee_estimate_failed", {
        ...baseFields,
        walletId: sender.id,
        code: body.code,
        rawMessage: body.rawMessage,
      });
      return {
        ok: false,
        status: 400,
        body,
      };
    }

    let order = await prisma.purchaseOrder.create({
      data: {
        userId,
        walletId: sender.id,
        fundId,
        costUsdt: cost,
        reservedUsdt: cost,
        status: "queued",
        step: PurchaseOrderStep.awaiting_trx,
        fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
        estimatedTrx: feeEstimate.estimatedTrx,
        topUpTxId: null,
        usdtTxId: null,
        investmentId: null,
        device: device || undefined,
      },
    });

    order = await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        chainMemo: buildIndieFundrMemo({
          kind: "invest",
          fundId,
          entityId: order.id,
        }),
      },
    });

    logFundsEvent("subscribe", "info", "order queued", {
      ...baseFields,
      orderId: order.id,
      walletId: sender.id,
      estimatedTrx: feeEstimate.estimatedTrx,
    });

    const fund = getFundById(fundId);

    return {
      ok: true,
      status: 202,
      data: {
        ...formatOrderResponse(order),
        message: "Subscription submitted.",
      },
    };
  } catch (err) {
    logFundsEvent("subscribe", "error", "unexpected error", {
      ...baseFields,
      reason: "unexpected",
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      status: 500,
      body: { msg: err instanceof Error ? err.message : "Internal Server Error" },
    };
  }
}

export async function getCurrentPurchaseOrder(
  userId: string,
  fundId: string
): Promise<FundsServiceResult<ReturnType<typeof formatOrderResponse>>> {
  if (!fundId || !isValidFundId(fundId)) {
    return { ok: false, status: 400, body: { msg: "fundId is required" } };
  }

  try {
    const order = await getActiveOrderForUser(userId, fundId);
    if (!order) {
      return {
        ok: false,
        status: 404,
        body: { msg: "No active purchase order for this fund" },
      };
    }

    const fresh = await prisma.purchaseOrder.findUnique({
      where: { id: order.id },
    });
    if (!fresh) {
      return {
        ok: false,
        status: 404,
        body: { msg: "No active purchase order for this fund" },
      };
    }

    return { ok: true, data: formatOrderResponse(fresh) };
  } catch (error) {
    console.error(
      "[getCurrentPurchaseOrder]",
      error instanceof Error ? error.message : error
    );
    return { ok: false, status: 500, body: { msg: "Internal Server Error" } };
  }
}

export async function getPurchaseOrderById(
  userId: string,
  orderId: string
): Promise<FundsServiceResult<ReturnType<typeof formatOrderResponse>>> {
  try {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) {
      return { ok: false, status: 404, body: { msg: "Order not found" } };
    }
    return { ok: true, data: formatOrderResponse(order) };
  } catch (error) {
    console.error(
      "[getPurchaseOrderById]",
      error instanceof Error ? error.message : error
    );
    return { ok: false, status: 500, body: { msg: "Internal Server Error" } };
  }
}
