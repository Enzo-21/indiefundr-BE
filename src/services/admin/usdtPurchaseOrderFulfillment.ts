import { UsdtPurchaseOrderStatus, type UsdtPurchaseOrder } from "@prisma/client";
import { getEnv } from "@/lib/env";
import {
  appendAutopilotNote,
  formatOrderAutopilotManualCheckNote,
} from "@/lib/admin/autopilotBatch";
import {
  buildIndieFundrMemo,
  isIndieFundrChainMemoEnabled,
} from "@/lib/tron/transactionMemo";
import { formatTronTransferError } from "@/lib/utils/tronErrors";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import type { AdminFulfillmentEstimate } from "@/services/admin/purchaseOrderFulfillment";
import { refreshWalletActivityForOrder } from "@/services/wallets/walletActivityRefresh";
import * as tron from "@/services/tron/client";

const OPEN_STATUSES: UsdtPurchaseOrderStatus[] = [
  UsdtPurchaseOrderStatus.awaiting_admin,
  UsdtPurchaseOrderStatus.paid,
];

export type AdminUsdtPurchaseRow = {
  orderType: "usdt_purchase";
  orderId: string;
  userId: string;
  userEmail: string;
  userName: string;
  costUsdt: number;
  reservedUsdt: number;
  totalArs: number;
  status: UsdtPurchaseOrderStatus;
  walletAddress: string;
  trxBalance: number | null;
  usdtBalance: number | null;
  balanceReadStatus: "ok";
  estimatedTrx: number | null;
  topUpTxId: null;
  usdtTxId: string | null;
  adminTrxTopUpTxId: null;
  adminUsdtTxId: string | null;
  adminNotes: string | null;
  topUpTronscanUrl: null;
  usdtTronscanUrl: string | null;
  mpPaymentId: string | null;
  normalizedDateIso: string;
  date: string;
  updatedAt: string;
  step: "awaiting_admin";
  fundId: null;
  destinationAddress: null;
};

export type UsdtPurchaseFulfillmentEstimate = AdminFulfillmentEstimate & {
  treasuryUsdtBalance: number;
  treasuryTrxBalance: number;
  canTransfer: boolean;
  message: string;
};

function getTreasuryPrivateKey(): string {
  const pk = getEnv().treasuryPrivateKey?.trim();
  if (!pk) {
    throw new Error("TREASURY_PRIVATE_KEY is not configured");
  }
  return pk;
}

async function loadOpenOrder(orderId: string): Promise<UsdtPurchaseOrder> {
  const order = await prisma.usdtPurchaseOrder.findUnique({
    where: { id: orderId },
  });
  if (!order) {
    throw new Error("USDT purchase order not found");
  }
  if (!OPEN_STATUSES.includes(order.status)) {
    throw new Error("USDT purchase order is not awaiting admin release");
  }
  return order;
}

export async function listAdminUsdtPurchaseQueue(): Promise<
  AdminUsdtPurchaseRow[]
> {
  const orders = await prisma.usdtPurchaseOrder.findMany({
    where: { status: { in: OPEN_STATUSES } },
    include: {
      user: { select: { id: true, email: true, name: true } },
      wallet: { select: { address: true } },
    },
    orderBy: { date: "asc" },
  });

  return orders.map((order) => {
    const usdtTxId = order.adminUsdtTxId;
    return {
      orderType: "usdt_purchase" as const,
      orderId: order.id,
      userId: order.userId,
      userEmail: order.user.email,
      userName: order.user.name,
      costUsdt: order.amountUsdt,
      reservedUsdt: 0,
      totalArs: order.totalArs,
      status: order.status,
      walletAddress: order.wallet.address,
      trxBalance: null,
      usdtBalance: null,
      balanceReadStatus: "ok" as const,
      estimatedTrx: null,
      topUpTxId: null,
      usdtTxId,
      adminTrxTopUpTxId: null,
      adminUsdtTxId: usdtTxId,
      adminNotes: order.adminNotes,
      topUpTronscanUrl: null,
      usdtTronscanUrl: usdtTxId ? getTronscanTxUrl(usdtTxId) : null,
      mpPaymentId: order.mpPaymentId,
      normalizedDateIso: order.date.toISOString(),
      date: order.date.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      step: "awaiting_admin" as const,
      fundId: null,
      destinationAddress: null,
    };
  });
}

export async function getUsdtPurchaseFulfillmentEstimate(
  orderId: string
): Promise<UsdtPurchaseFulfillmentEstimate> {
  const order = await loadOpenOrder(orderId);
  const treasury = getEnv().treasuryAddress;
  if (!treasury) {
    throw new Error("Treasury address is not configured");
  }

  const estimate = await tron.estimateUsdtTransfer({
    fromAddress: treasury,
    toAddress: (
      await prisma.wallet.findUniqueOrThrow({ where: { id: order.walletId } })
    ).address,
    amount: order.amountUsdt,
  });

  const canTransfer = estimate.hasEnoughUsdt && estimate.hasEnoughTrx;
  const formatted = formatTronTransferError(
    canTransfer ? "ok" : estimate.hasEnoughUsdt ? "insufficient trx" : "insufficient usdt",
    {
      fromAddress: treasury,
      trxBalance: estimate.trxBalance,
      usdtBalance: estimate.usdtBalance,
      amountUsdt: order.amountUsdt,
      estimatedTrx: estimate.estimatedTrx,
    }
  );

  return {
    estimatedTrx: estimate.estimatedTrx,
    trxBalance: estimate.trxBalance,
    shortfall: Math.max(0, estimate.estimatedTrx - estimate.trxBalance),
    hasEnoughTrx: estimate.hasEnoughTrx,
    hasEnoughUsdt: estimate.hasEnoughUsdt,
    costUsdt: order.amountUsdt,
    canTransfer,
    message: canTransfer
      ? "Treasury can cover this USDT purchase release"
      : typeof formatted.msg === "string"
        ? formatted.msg
        : "Treasury cannot cover this transfer",
    treasuryUsdtBalance: estimate.usdtBalance,
    treasuryTrxBalance: estimate.trxBalance,
  };
}

export async function resetUsdtPurchaseUsdtForRetry(
  orderId: string,
  options: { appendNote?: string } = {}
): Promise<void> {
  const order = await loadOpenOrder(orderId);
  await prisma.usdtPurchaseOrder.update({
    where: { id: orderId },
    data: {
      adminUsdtTxId: null,
      status: UsdtPurchaseOrderStatus.awaiting_admin,
      failureReason: options.appendNote
        ? appendAutopilotNote(order.failureReason, options.appendNote)
        : order.failureReason,
    },
  });
}

export async function broadcastUsdtPurchaseUsdt(
  orderId: string,
  adminEmail?: string
): Promise<string> {
  let order = await loadOpenOrder(orderId);
  const wallet = await prisma.wallet.findUnique({
    where: { id: order.walletId },
  });
  if (!wallet?.address) {
    throw new Error("User wallet not found");
  }

  const existingTxId = order.adminUsdtTxId?.trim();
  if (existingTxId) {
    const inspection = await tron.inspectTransactionOnChain(existingTxId);
    if (inspection.usdtTransferSuccessful) {
      return existingTxId;
    }
    if (inspection.status === "pending") {
      return existingTxId;
    }
    if (inspection.status === "failed") {
      await resetUsdtPurchaseUsdtForRetry(orderId, {
        appendNote: formatOrderAutopilotManualCheckNote(
          "Previous USDT broadcast failed on-chain; cleared tx id for retry"
        ),
      });
      order = await loadOpenOrder(orderId);
    }
  }

  const estimate = await getUsdtPurchaseFulfillmentEstimate(orderId);
  if (!estimate.canTransfer) {
    throw new Error(estimate.message || "Treasury cannot cover this transfer");
  }

  const chainMemo = isIndieFundrChainMemoEnabled()
    ? buildIndieFundrMemo({
        kind: "payout",
        fundId: "usdtbuy",
        entityId: order.id,
      })
    : undefined;

  const signed = await tron.transferUsdt({
    fromPrivateKey: getTreasuryPrivateKey(),
    toAddress: wallet.address,
    amount: order.amountUsdt,
    memo: chainMemo,
  });
  const txId = tron.getTxId(signed);
  if (!txId) {
    throw new Error("USDT broadcast missing transaction id");
  }

  await prisma.usdtPurchaseOrder.update({
    where: { id: orderId },
    data: {
      adminUsdtTxId: txId,
      ...(adminEmail ? { adminSettledBy: adminEmail } : {}),
    },
  });

  return txId;
}

export async function completeUsdtPurchaseOrder(
  orderId: string,
  adminEmail: string,
  usdtTxId?: string
): Promise<void> {
  const order = await prisma.usdtPurchaseOrder.findUnique({
    where: { id: orderId },
    include: { wallet: { select: { id: true, address: true } } },
  });
  if (!order) {
    throw new Error("USDT purchase order not found");
  }
  if (order.status === UsdtPurchaseOrderStatus.completed) {
    return;
  }
  if (order.status === UsdtPurchaseOrderStatus.failed) {
    throw new Error("USDT purchase order is marked failed");
  }
  if (!OPEN_STATUSES.includes(order.status)) {
    throw new Error("USDT purchase order is not awaiting admin release");
  }

  const txId = (usdtTxId ?? order.adminUsdtTxId)?.trim();
  if (!txId) {
    throw new Error("USDT transaction id is required to complete purchase");
  }

  const transferOk = await tron.isUsdtTransferSuccessful(txId);
  if (!transferOk) {
    const failure = await tron.getTransactionFailureReason(txId);
    throw new Error(
      failure.message || "USDT transfer did not succeed on-chain"
    );
  }

  const entityId = `usdt_purchase:${order.id}`;
  await prisma.$transaction(async (tx) => {
    await tx.usdtPurchaseOrder.update({
      where: { id: orderId },
      data: {
        adminUsdtTxId: txId,
        status: UsdtPurchaseOrderStatus.completed,
        adminSettledBy: adminEmail,
        adminSettledAt: new Date(),
        failureReason: null,
      },
    });

    const existing = await tx.walletActivity.findFirst({
      where: { walletId: order.walletId, entityId },
    });
    if (!existing) {
      await tx.walletActivity.create({
        data: {
          userId: order.userId,
          walletId: order.walletId,
          kind: "usdt_purchase",
          entityId,
          txId,
          type: "credit",
          amountUsdt: order.amountUsdt,
          status: "confirmed",
          label: "USDT purchase",
          detail: "Mercado Pago",
          occurredAt: new Date(),
          tronscanUrl: getTronscanTxUrl(txId),
          chainFinal: true,
        },
      });
    }
  });

  await refreshWalletActivityForOrder({
    userId: order.userId,
    walletId: order.walletId,
  });
}

export async function markUsdtPurchaseOrderFailed(
  orderId: string,
  reason: string,
  adminEmail: string
): Promise<void> {
  await prisma.usdtPurchaseOrder.update({
    where: { id: orderId },
    data: {
      status: UsdtPurchaseOrderStatus.failed,
      failureReason: reason.trim() || "Declined by admin",
      adminSettledBy: adminEmail,
    },
  });
}
