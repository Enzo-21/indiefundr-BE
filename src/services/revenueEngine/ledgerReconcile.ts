import {
  InvestmentStatus,
  PurchaseOrderStatus,
  TreasuryEventType,
  type TreasuryLedger,
} from "@prisma/client";
import { roundUsdt } from "@/lib/config/revenueEngine";
import { surplusPerSubscription } from "@/lib/config/investmentCohort";
import { getEnv } from "@/lib/env";
import { GLOBAL_LEDGER_ID, prisma } from "@/lib/prisma";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { getOrCreateLedger } from "./ledger";

const SURPLUS_RESTORE_REASONS = new Set([
  "surplus_payout_broadcast_failed",
  "surplus_payout_failed_on_chain",
]);

/** USDT fields compared with roundUsdt; mismatch if abs delta > this. */
export const LEDGER_RECONCILE_EPSILON = 1e-4;

const SUBSCRIBED_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.active,
  InvestmentStatus.matured,
  InvestmentStatus.redeeming,
  InvestmentStatus.redeemed,
];

export type ExpectedLedgerValues = {
  poolAvailable: number;
  treasurySurplus: number;
  protectedRevenueWithdrawn: number;
};

export type LedgerIntegrityReport = {
  confirmedSubscriptionCount: number;
  mismatch: boolean;
  purchaseOrdersWithUsdtTxId: number;
  treasuryEventCount: number;
  appRevenueWithdrawalCount: number;
  investmentSampleIds: string[];
  stored: ExpectedLedgerValues;
  expected: ExpectedLedgerValues;
};

export type LedgerReconciliationResult = {
  updated: boolean;
  stored: ExpectedLedgerValues;
  expected: ExpectedLedgerValues;
  deltas: ExpectedLedgerValues;
  adjustedFields: (keyof ExpectedLedgerValues)[];
};

function ledgerFields(ledger: TreasuryLedger): ExpectedLedgerValues {
  return {
    poolAvailable: ledger.poolAvailable,
    treasurySurplus: ledger.treasurySurplus,
    protectedRevenueWithdrawn: ledger.protectedRevenueWithdrawn,
  };
}

export function fieldsMismatch(
  stored: ExpectedLedgerValues,
  expected: ExpectedLedgerValues
): boolean {
  const keys = Object.keys(expected) as (keyof ExpectedLedgerValues)[];
  return keys.some(
    (key) =>
      Math.abs(roundUsdt(stored[key]) - roundUsdt(expected[key])) >
      LEDGER_RECONCILE_EPSILON
  );
}

function logLedgerDebug(payload: Record<string, unknown>) {
  console.log("[treasuryLedger]", JSON.stringify(payload, null, 2));
}

function computeDeltas(
  stored: ExpectedLedgerValues,
  expected: ExpectedLedgerValues
): ExpectedLedgerValues {
  return {
    poolAvailable: roundUsdt(expected.poolAvailable - stored.poolAvailable),
    treasurySurplus: roundUsdt(expected.treasurySurplus - stored.treasurySurplus),
    protectedRevenueWithdrawn: roundUsdt(
      expected.protectedRevenueWithdrawn - stored.protectedRevenueWithdrawn
    ),
  };
}

function adjustedFields(deltas: ExpectedLedgerValues): (keyof ExpectedLedgerValues)[] {
  const keys = Object.keys(deltas) as (keyof ExpectedLedgerValues)[];
  return keys.filter((key) => Math.abs(deltas[key]) > LEDGER_RECONCILE_EPSILON);
}

function getMetaReason(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const reason = (meta as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

export async function computeExpectedLedger(): Promise<{
  expected: ExpectedLedgerValues;
  confirmedSubscriptionCount: number;
  investmentSampleIds: string[];
  purchaseOrdersWithUsdtTxId: number;
}> {
  const [subscribedInvestments, redeemedInvestments, withdrawals, surplusEvents] =
    await Promise.all([
      prisma.investment.findMany({
        where: {
          subscribedAt: { not: null },
          status: { in: SUBSCRIBED_STATUSES },
          purchaseOrder: {
            status: PurchaseOrderStatus.completed,
            usdtTxId: { not: null },
          },
        },
        select: {
          id: true,
          status: true,
          subscribedAt: true,
          amountUsdt: true,
          projectedPayoutUsdt: true,
          purchaseOrder: { select: { usdtTxId: true } },
        },
      }),
      prisma.investment.findMany({
        where: {
          status: InvestmentStatus.redeemed,
          purchaseOrder: {
            status: PurchaseOrderStatus.completed,
            usdtTxId: { not: null },
          },
        },
        select: {
          id: true,
          userId: true,
          amountUsdt: true,
          projectedPayoutUsdt: true,
          payoutUnlockingInvestmentIds: true,
          payoutUnlockingUserIds: true,
        },
      }),
      prisma.appRevenueWithdrawal.findMany({
        select: { amountUsdt: true },
      }),
      prisma.treasuryEvent.findMany({
        where: {
          type: {
            in: [
              TreasuryEventType.surplus_draw,
              TreasuryEventType.surplus_credit,
            ],
          },
        },
        select: { type: true, amountUsdt: true, meta: true },
      }),
    ]);

  const purchaseOrdersWithUsdtTxId = await prisma.purchaseOrder.count({
    where: { usdtTxId: { not: null } },
  });

  const subscribed = subscribedInvestments;
  const confirmedSubscriptionCount = subscribed.length;

  // pool ≈ gross subscriptions − sum(redeemed payouts) − platform withdrawals
  // (see specs/revenue-engine/README.md — cohort formulas)
  let poolAvailable = subscribed.reduce((sum, inv) => sum + inv.amountUsdt, 0);
  for (const inv of redeemedInvestments) {
    poolAvailable -= inv.projectedPayoutUsdt || 0;
  }
  poolAvailable -= withdrawals.reduce((sum, row) => sum + row.amountUsdt, 0);
  poolAvailable = ledgerTruncateUsdt(Math.max(0, poolAvailable));

  const protectedRevenueWithdrawn = ledgerTruncateUsdt(
    withdrawals.reduce((sum, row) => sum + row.amountUsdt, 0)
  );

  // Surplus = Σ subscribe slice per confirmed sub − surplus_draw (+ restores)
  let treasurySurplus = 0;
  for (const inv of subscribed) {
    treasurySurplus += surplusPerSubscription(
      inv.projectedPayoutUsdt,
      inv.amountUsdt
    );
  }
  for (const event of surplusEvents) {
    if (event.type === TreasuryEventType.surplus_draw) {
      treasurySurplus -= event.amountUsdt;
    } else if (SURPLUS_RESTORE_REASONS.has(getMetaReason(event.meta) ?? "")) {
      treasurySurplus += event.amountUsdt;
    }
  }
  treasurySurplus = ledgerTruncateUsdt(Math.max(0, treasurySurplus));

  return {
    expected: {
      poolAvailable,
      treasurySurplus,
      protectedRevenueWithdrawn,
    },
    confirmedSubscriptionCount,
    investmentSampleIds: subscribed.slice(0, 5).map((inv) => inv.id),
    purchaseOrdersWithUsdtTxId,
  };
}

/** Read-only: compare stored ledger to subscription-derived expectation (no DB writes). */
export async function buildLedgerIntegrityReport(): Promise<LedgerIntegrityReport> {
  const stored = ledgerFields(await getOrCreateLedger());
  const {
    expected,
    confirmedSubscriptionCount,
    investmentSampleIds,
    purchaseOrdersWithUsdtTxId,
  } = await computeExpectedLedger();

  const [treasuryEventCount, appRevenueWithdrawalCount] = await Promise.all([
    prisma.treasuryEvent.count(),
    prisma.appRevenueWithdrawal.count(),
  ]);

  return {
    confirmedSubscriptionCount,
    mismatch: fieldsMismatch(stored, expected),
    purchaseOrdersWithUsdtTxId,
    treasuryEventCount,
    appRevenueWithdrawalCount,
    investmentSampleIds,
    stored,
    expected,
  };
}

export async function reconcileTreasurySurplusFromTriads(): Promise<{
  updated: boolean;
  stored: number;
  expected: number;
  delta: number;
}> {
  const ledger = await getOrCreateLedger();
  const { expected } = await computeExpectedLedger();
  const stored = roundUsdt(ledger.treasurySurplus);
  const expectedSurplus = roundUsdt(expected.treasurySurplus);
  const delta = roundUsdt(expectedSurplus - stored);

  if (Math.abs(delta) <= LEDGER_RECONCILE_EPSILON) {
    return { updated: false, stored, expected: expectedSurplus, delta: 0 };
  }

  const updated = await prisma.treasuryLedger.update({
    where: { id: GLOBAL_LEDGER_ID },
    data: {
      treasurySurplus: expectedSurplus,
      version: ledger.version + 1,
      updatedAt: new Date(),
    },
  });

  await prisma.treasuryEvent.create({
    data: {
      type: TreasuryEventType.ledger_adjustment,
      amountUsdt: delta,
      poolAfter: updated.poolAvailable,
      surplusAfter: updated.treasurySurplus,
      protectedCreditedAfter: updated.protectedRevenueCredited,
      protectedWithdrawnAfter: updated.protectedRevenueWithdrawn,
      meta: {
        field: "treasurySurplus",
        reason: "triad_surplus_reconcile",
        stored,
        expected: expectedSurplus,
        delta,
      },
    },
  });

  return { updated: true, stored, expected: expectedSurplus, delta };
}

/** @deprecated Auto-reconcile disabled — ledger is event-sourced. Use buildLedgerIntegrityReport for diagnostics only. */
export async function reconcileTreasuryLedgerFromExpected(): Promise<LedgerReconciliationResult> {
  const ledger = await getOrCreateLedger();
  const stored = ledgerFields(ledger);
  const { expected } = await computeExpectedLedger();
  const deltas = computeDeltas(stored, expected);
  return {
    updated: false,
    stored,
    expected,
    deltas,
    adjustedFields: [],
  };
}

/** Logs when TREASURY_LEDGER_DEBUG=true; never mutates TreasuryLedger. */
export async function logLedgerIntegrityIfDebug(): Promise<void> {
  if (!getEnv().treasuryLedgerDebug) return;

  const report = await buildLedgerIntegrityReport();
  logLedgerDebug({
    ...report,
    note: report.mismatch
      ? "Stored ledger differs from subscription-derived expectation; fix via app events or one-time DB cleanup + db:seed"
      : "Stored ledger matches subscription-derived expectation",
  });
}
