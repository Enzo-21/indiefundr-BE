import {
  FeeSponsorshipStatus,
  PurchaseOrderStatus,
  type PurchaseOrder,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  getTxId,
  sweepTrxToTreasury,
  type UsdtTransferEstimate,
} from "@/services/tron/client";

export function isEnabled(): boolean {
  return getEnv().feeSponsorshipEnabled;
}

function getStartOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const ACTIVE_SPONSOR_STATUSES: FeeSponsorshipStatus[] = [
  FeeSponsorshipStatus.topped_up,
  FeeSponsorshipStatus.purchase_ok,
  FeeSponsorshipStatus.recovered,
  FeeSponsorshipStatus.loss,
];

const ACTIVE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.queued,
  PurchaseOrderStatus.processing,
  PurchaseOrderStatus.completed,
  PurchaseOrderStatus.failed,
];

export async function getUserSponsorshipStatsToday(userId: string): Promise<{
  attempts: number;
  totalSponsoredTrx: number;
}> {
  const since = getStartOfUtcDay();

  const legacyRows = await prisma.feeSponsorship.findMany({
    where: {
      userId,
      date: { gte: since },
      status: { in: ACTIVE_SPONSOR_STATUSES },
    },
    select: { sponsoredTrx: true },
  });

  const orderRows = await prisma.purchaseOrder.findMany({
    where: {
      userId,
      date: { gte: since },
      sponsoredTrx: { gt: 0 },
      status: { in: ACTIVE_ORDER_STATUSES },
    },
    select: { sponsoredTrx: true },
  });

  const totalSponsoredTrx =
    legacyRows.reduce((sum, r) => sum + (r.sponsoredTrx || 0), 0) +
    orderRows.reduce((sum, r) => sum + (r.sponsoredTrx || 0), 0);

  return {
    attempts: legacyRows.length + orderRows.length,
    totalSponsoredTrx,
  };
}

export function computeSponsorShortfall(
  feeEstimate: Pick<UsdtTransferEstimate, "estimatedTrx" | "trxBalance">
): number {
  return parseFloat(
    Math.max(0, feeEstimate.estimatedTrx - feeEstimate.trxBalance).toFixed(6)
  );
}

export async function assertCanSponsor(
  _userId: string,
  additionalTrx: number,
  _opts: { existingSponsoredOnOrder?: number } = {}
): Promise<void> {
  if (additionalTrx <= 0) {
    throw new Error("Fee sponsorship amount must be positive");
  }
}

export async function recoverSponsoredTrxFromOrder({
  userWallet,
  treasuryAddress,
  order,
}: {
  userWallet: { privateKey: string };
  treasuryAddress: string;
  order: PurchaseOrder;
}): Promise<PurchaseOrder> {
  if (!order || order.sponsoredTrx <= 0) {
    return order;
  }

  if (order.recoveredTrx > 0 && order.sweepTxId) {
    return order;
  }

  const reserve = getEnv().sponsorTrxReserve;
  let sweep: Record<string, unknown> | null = null;

  try {
    sweep = await sweepTrxToTreasury({
      userPrivateKey: userWallet.privateKey,
      treasuryAddress,
      maxAmountTrx: order.sponsoredTrx,
      reserveTrx: reserve,
      trxBalanceBefore: order.trxBefore,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[feeSponsorship] sweep failed:", message);
  }

  const sweepTxId = sweep ? getTxId(sweep) : null;
  const finalRecovered = sweepTxId
    ? Number((sweep as { amountTrx?: number }).amountTrx || 0)
    : 0;

  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      sweepTxId,
      recoveredTrx: finalRecovered,
      updatedAt: new Date(),
    },
  });

  console.log("[feeSponsorship] order recovery", {
    orderId: order.id,
    recoveredTrx: finalRecovered,
    sweepTxId,
  });

  return updated;
}

export async function findSponsorshipForSeed(seed: {
  purchaseOrderId?: string | null;
  id?: string;
  transaction?: Record<string, unknown> | null;
} | null): Promise<PurchaseOrder | null> {
  if (!seed) return null;

  if (seed.purchaseOrderId) {
    return prisma.purchaseOrder.findUnique({
      where: { id: seed.purchaseOrderId },
    });
  }

  const txId = getTxId(seed.transaction);
  if (txId) {
    const byTx = await prisma.purchaseOrder.findFirst({
      where: { usdtTxId: txId },
    });
    if (byTx) return byTx;
  }

  if (seed.id) {
    const fee = await prisma.feeSponsorship.findFirst({
      where: { seedId: seed.id },
      orderBy: { date: "desc" },
    });
    if (fee?.usdtTxId) {
      return prisma.purchaseOrder.findFirst({
        where: { usdtTxId: fee.usdtTxId },
      });
    }
    if (fee) {
      return prisma.purchaseOrder.findFirst({
        where: {
          userId: fee.userId,
          walletId: fee.walletId,
          sponsoredTrx: { gt: 0 },
        },
        orderBy: { date: "desc" },
      });
    }
  }

  return null;
}
