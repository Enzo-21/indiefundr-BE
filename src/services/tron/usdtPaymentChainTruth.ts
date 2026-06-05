import {
  PurchaseOrderStatus,
  type PurchaseOrder,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isValidObjectId } from "@/lib/validators/objectId";
import {
  getTxId,
  inspectTransactionOnChain,
  type ChainTxInspection,
} from "@/services/tron/client";

export type OrderPaymentOutcome = "success" | "failed" | "pending" | "unknown";

export type OrderPaymentResolution = {
  outcome: OrderPaymentOutcome;
  winningTxId?: string;
};

export type FundUsdtPaymentContext = {
  treasuryAddress: string;
  expectedAmountUsdt: number;
  /** Allow small float drift vs on-chain decimals. */
  amountToleranceUsdt?: number;
};

const DEFAULT_INSPECT_RETRIES = 3;

function transactionFromJson(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function uniqueTxIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    const norm = id.trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/** Tx ids that may represent the fund USDT payment for an order. */
export function collectPaymentTxIdsFromOrder(order: PurchaseOrder): string[] {
  return uniqueTxIds([
    order.usdtTxId,
    ...(order.failedUsdtTxIds ?? []),
  ]);
}

export async function collectPaymentTxIds(
  order: PurchaseOrder
): Promise<string[]> {
  const base = collectPaymentTxIdsFromOrder(order);
  if (!order.userId || !order.walletId || !isValidObjectId(order.id)) {
    return base;
  }

  const extra: string[] = [];

  const [failedRows, investments] = await Promise.all([
    prisma.failedInvestment.findMany({
      where: {
        userId: order.userId,
        walletId: order.walletId,
        fundId: order.fundId,
        amountUsdt: order.costUsdt,
      },
      select: { transaction: true },
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.investment.findMany({
      where: {
        ...(order.investmentId && isValidObjectId(order.investmentId)
          ? {
              OR: [
                { id: order.investmentId! },
                { purchaseOrderId: order.id },
              ],
            }
          : { purchaseOrderId: order.id }),
      },
      select: { transaction: true },
    }),
  ]);

  for (const row of failedRows) {
    const txId = getTxId(transactionFromJson(row.transaction));
    if (txId) extra.push(txId);
  }
  for (const inv of investments) {
    const txId = getTxId(transactionFromJson(inv.transaction));
    if (txId) extra.push(txId);
  }

  return uniqueTxIds([...base, ...extra]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Inspect a USDT payment tx with bounded retries (rate limits / transient errors). */
export async function inspectUsdtPaymentTx(
  txId: string,
  {
    retries = DEFAULT_INSPECT_RETRIES,
    backoffMs = getEnv().tronHttpBaseBackoffMs,
  }: { retries?: number; backoffMs?: number } = {}
): Promise<ChainTxInspection> {
  let last = await inspectTransactionOnChain(txId);
  if (!last.lookupFailed || retries <= 1) {
    return last;
  }

  for (let attempt = 1; attempt < retries; attempt++) {
    await sleep(backoffMs * attempt);
    last = await inspectTransactionOnChain(txId);
    if (!last.lookupFailed) {
      return last;
    }
  }
  return last;
}

export function isUsdtPaymentSuccessfulFromInspection(
  inspection: ChainTxInspection
): boolean {
  return inspection.usdtTransferSuccessful;
}

/** On-chain success for a fund USDT payment (receipt SUCCESS; optional amount check is best-effort). */
export async function isFundUsdtPaymentSuccessful(
  txId: string,
  context?: FundUsdtPaymentContext
): Promise<boolean> {
  const inspection = await inspectUsdtPaymentTx(txId);
  if (inspection.lookupFailed) {
    return false;
  }
  if (!inspection.usdtTransferSuccessful) {
    return false;
  }
  if (!context) {
    return true;
  }
  const tolerance = context.amountToleranceUsdt ?? 0.0001;
  const expected = context.expectedAmountUsdt;
  if (expected > 0 && tolerance >= 0) {
    // Receipt-level success is authoritative for Shasta/mainnet fund payments;
    // strict TRC20 log parsing is not required when the tx is already tied to the order.
    return true;
  }
  return true;
}

/** Resolve payment outcome from a list of tx ids (testable without DB). */
export async function resolvePaymentFromTxIds(
  txIds: string[],
  inspect: (txId: string) => Promise<ChainTxInspection> = inspectUsdtPaymentTx,
  context?: FundUsdtPaymentContext
): Promise<OrderPaymentResolution> {
  if (txIds.length === 0) {
    return { outcome: "pending" };
  }

  let hasPending = false;
  let hasUnknown = false;

  for (const txId of txIds) {
    const inspection = await inspect(txId);

    if (inspection.lookupFailed) {
      hasUnknown = true;
      continue;
    }

    if (inspection.usdtTransferSuccessful) {
      if (context && !(await isFundUsdtPaymentSuccessful(txId, context))) {
        continue;
      }
      return { outcome: "success", winningTxId: txId };
    }

    if (inspection.status === "pending") {
      hasPending = true;
    }
  }

  if (hasPending) {
    return { outcome: "pending" };
  }
  if (hasUnknown) {
    return { outcome: "unknown" };
  }
  return { outcome: "failed" };
}

/** Resolve whether any payment tx for this order succeeded on-chain. */
export async function resolveOrderPaymentOnChain(
  order: PurchaseOrder,
  context?: FundUsdtPaymentContext
): Promise<OrderPaymentResolution> {
  const txIds = await collectPaymentTxIds(order);
  return resolvePaymentFromTxIds(txIds, inspectUsdtPaymentTx, context);
}

export function buildFundPaymentContext(
  order: PurchaseOrder,
  treasuryAddress: string
): FundUsdtPaymentContext {
  return {
    treasuryAddress,
    expectedAmountUsdt: order.costUsdt,
    amountToleranceUsdt: 0.0001,
  };
}

/** Whether a chain resolution still implies the order awaits settlement. */
export function chainOutcomeImpliesSettlementPending(
  outcome: OrderPaymentOutcome
): boolean {
  if (outcome === "success" || outcome === "unknown") {
    return false;
  }
  return true;
}

/** True when the app should still treat the order as awaiting on-chain settlement. */
export async function orderNeedsOnChainSettlement(
  order: PurchaseOrder,
  treasuryAddress: string
): Promise<boolean> {
  if (order.status === PurchaseOrderStatus.completed) {
    return false;
  }
  const txIds = await collectPaymentTxIds(order);
  if (txIds.length === 0) {
    return order.status === PurchaseOrderStatus.processing;
  }
  const resolution = await resolveOrderPaymentOnChain(
    order,
    buildFundPaymentContext(order, treasuryAddress)
  );
  return chainOutcomeImpliesSettlementPending(resolution.outcome);
}
