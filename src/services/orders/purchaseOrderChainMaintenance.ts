import {
  InvestmentStatus,
  PurchaseOrderStatus,
  type FailedInvestment,
  type PurchaseOrder,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  failedOrderCoversFailedInvestment,
} from "@/lib/wallets/failedInvestmentMatch";
import { getTxId } from "@/services/tron/client";
import {
  inspectUsdtPaymentTx,
  resolvePaymentFromTxIds,
} from "@/services/tron/usdtPaymentChainTruth";

function transactionFromJson(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export type FailedInvestmentCleanupReason =
  | "covered_by_failed_order"
  | "orphan_chain_success";

async function shouldDeleteOrphanFailedInvestment(
  item: FailedInvestment,
  txId: string
): Promise<FailedInvestmentCleanupReason | null> {
  if (!item.userId || !item.walletId) {
    return null;
  }

  const resolution = await resolvePaymentFromTxIds([txId], inspectUsdtPaymentTx);
  if (resolution.outcome !== "success") {
    return null;
  }

  const completedOrder = await prisma.purchaseOrder.findFirst({
    where: {
      userId: item.userId,
      walletId: item.walletId,
      OR: [{ usdtTxId: txId }, { failedUsdtTxIds: { has: txId } }],
      status: PurchaseOrderStatus.completed,
    },
  });
  if (completedOrder) {
    return "orphan_chain_success";
  }

  const anyOrderWithTx = await prisma.purchaseOrder.findFirst({
    where: {
      userId: item.userId,
      walletId: item.walletId,
      OR: [{ usdtTxId: txId }, { failedUsdtTxIds: { has: txId } }],
    },
  });
  if (anyOrderWithTx) {
    return "orphan_chain_success";
  }

  const active = await prisma.investment.findFirst({
    where: {
      userId: item.userId,
      walletId: item.walletId,
      fundId: item.fundId,
      amountUsdt: item.amountUsdt,
      status: { not: InvestmentStatus.failed },
    },
  });
  if (active) {
    return "orphan_chain_success";
  }

  return null;
}

/** Delete a single FailedInvestment row when it is redundant or an on-chain-success orphan. */
export async function tryDeleteRedundantFailedInvestment(
  item: FailedInvestment,
  failedOrders: PurchaseOrder[]
): Promise<boolean> {
  const itemTxId = getTxId(transactionFromJson(item.transaction));

  for (const order of failedOrders) {
    if (
      order.userId === item.userId &&
      order.walletId === item.walletId &&
      failedOrderCoversFailedInvestment(order, item, itemTxId)
    ) {
      await prisma.failedInvestment.delete({ where: { id: item.id } });
      console.log("[chain_maintenance] deleted_failed_investment", {
        id: item.id,
        txId: itemTxId,
        reason: "covered_by_failed_order",
        orderId: order.id,
      });
      return true;
    }
  }

  if (itemTxId) {
    const orphanReason = await shouldDeleteOrphanFailedInvestment(item, itemTxId);
    if (orphanReason) {
      await prisma.failedInvestment.delete({ where: { id: item.id } });
      console.log("[chain_maintenance] deleted_failed_investment", {
        id: item.id,
        txId: itemTxId,
        reason: orphanReason,
      });
      return true;
    }
  }

  return false;
}

export async function cleanupRedundantFailedInvestments({
  limit,
  userId,
}: {
  limit?: number;
  userId?: string;
} = {}): Promise<{ deleted: number }> {
  const batchLimit = limit ?? getEnv().failedInvestmentCleanupLimit;

  const [failedInvestments, failedOrders] = await Promise.all([
    prisma.failedInvestment.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { date: "desc" },
      take: batchLimit,
    }),
    prisma.purchaseOrder.findMany({
      where: {
        status: PurchaseOrderStatus.failed,
        ...(userId ? { userId } : {}),
      },
    }),
  ]);

  let deleted = 0;
  for (const item of failedInvestments) {
    if (await tryDeleteRedundantFailedInvestment(item, failedOrders)) {
      deleted += 1;
    }
  }

  if (deleted > 0) {
    console.log("[chain_maintenance] cleanup_batch", { deleted, userId: userId ?? null });
  }

  return { deleted };
}
