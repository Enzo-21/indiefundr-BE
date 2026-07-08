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

export type ForfeitureImpactSummary = {
  count: number;
  principalTotal: number;
  surplusSliceTotal: number;
  poolCohortDrift: number;
  surplusCohortDrift: number;
};

export type LedgerIntegrityReport = {
  confirmedSubscriptionCount: number;
  mismatch: boolean;
  cohortMismatch: boolean;
  purchaseOrdersWithUsdtTxId: number;
  treasuryEventCount: number;
  appRevenueWithdrawalCount: number;
  investmentSampleIds: string[];
  stored: ExpectedLedgerValues;
  /** Event-sourced replay of TreasuryEvents (primary diagnostic). */
  expected: ExpectedLedgerValues;
  /** Legacy status-based cohort formula (informational). */
  cohortExpected: ExpectedLedgerValues;
  forfeitureImpact: ForfeitureImpactSummary;
};

export type LedgerReconciliationResult = {
  updated: boolean;
  stored: ExpectedLedgerValues;
  expected: ExpectedLedgerValues;
  deltas: ExpectedLedgerValues;
  adjustedFields: (keyof ExpectedLedgerValues)[];
};

export type TreasuryEventReplayRow = {
  type: TreasuryEventType;
  amountUsdt: number;
  meta: unknown;
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

function getMetaReason(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const reason = (meta as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

function getMetaField(
  meta: unknown
): keyof ExpectedLedgerValues | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const field = (meta as { field?: unknown }).field;
  if (
    field === "poolAvailable" ||
    field === "treasurySurplus" ||
    field === "protectedRevenueWithdrawn"
  ) {
    return field;
  }
  return null;
}

function applyLedgerAdjustmentDelta(
  state: ExpectedLedgerValues,
  field: keyof ExpectedLedgerValues,
  delta: number
): void {
  if (field === "poolAvailable") {
    state.poolAvailable = ledgerTruncateUsdt(
      Math.max(0, state.poolAvailable + delta)
    );
    return;
  }
  if (field === "treasurySurplus") {
    state.treasurySurplus = ledgerTruncateUsdt(
      Math.max(0, state.treasurySurplus + delta)
    );
    return;
  }
  state.protectedRevenueWithdrawn = ledgerTruncateUsdt(
    Math.max(0, state.protectedRevenueWithdrawn + delta)
  );
}

/** Pure replay of treasury events — mirrors stored ledger event handlers. */
export function replayExpectedLedgerFromEvents(
  events: TreasuryEventReplayRow[]
): ExpectedLedgerValues {
  const state: ExpectedLedgerValues = {
    poolAvailable: 0,
    treasurySurplus: 0,
    protectedRevenueWithdrawn: 0,
  };

  for (const event of events) {
    const amount = ledgerTruncateUsdt(event.amountUsdt);

    switch (event.type) {
      case TreasuryEventType.subscribe_inflow:
        state.poolAvailable = ledgerTruncateUsdt(state.poolAvailable + amount);
        break;
      case TreasuryEventType.payout_outflow:
      case TreasuryEventType.referral_principal_recovery:
        state.poolAvailable = ledgerTruncateUsdt(
          Math.max(0, state.poolAvailable - amount)
        );
        break;
      case TreasuryEventType.app_withdrawal:
        state.poolAvailable = ledgerTruncateUsdt(
          Math.max(0, state.poolAvailable - amount)
        );
        state.protectedRevenueWithdrawn = ledgerTruncateUsdt(
          state.protectedRevenueWithdrawn + amount
        );
        break;
      case TreasuryEventType.external_deposit_inflow:
        state.poolAvailable = ledgerTruncateUsdt(state.poolAvailable + amount);
        break;
      case TreasuryEventType.surplus_credit:
        state.treasurySurplus = ledgerTruncateUsdt(state.treasurySurplus + amount);
        break;
      case TreasuryEventType.surplus_draw:
      case TreasuryEventType.referral_bonus_outflow:
        state.treasurySurplus = ledgerTruncateUsdt(
          Math.max(0, state.treasurySurplus - amount)
        );
        break;
      case TreasuryEventType.ledger_adjustment: {
        const field = getMetaField(event.meta);
        if (field) {
          applyLedgerAdjustmentDelta(state, field, amount);
        }
        break;
      }
      case TreasuryEventType.obligation_forfeiture:
        break;
      default:
        break;
    }
  }

  return state;
}

export async function computeExpectedLedgerFromEvents(): Promise<ExpectedLedgerValues> {
  const events = await prisma.treasuryEvent.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      type: true,
      amountUsdt: true,
      meta: true,
    },
  });

  return replayExpectedLedgerFromEvents(events);
}

export async function computeForfeitureImpact(): Promise<ForfeitureImpactSummary> {
  const forfeited = await prisma.investment.findMany({
    where: {
      status: InvestmentStatus.forfeited,
      subscribedAt: { not: null },
      purchaseOrder: {
        status: PurchaseOrderStatus.completed,
        usdtTxId: { not: null },
      },
    },
    select: {
      amountUsdt: true,
      projectedPayoutUsdt: true,
    },
  });

  let principalTotal = 0;
  let surplusSliceTotal = 0;
  for (const inv of forfeited) {
    principalTotal += inv.amountUsdt;
    surplusSliceTotal += surplusPerSubscription(
      inv.projectedPayoutUsdt,
      inv.amountUsdt
    );
  }

  principalTotal = ledgerTruncateUsdt(principalTotal);
  surplusSliceTotal = ledgerTruncateUsdt(surplusSliceTotal);

  return {
    count: forfeited.length,
    principalTotal,
    surplusSliceTotal,
    poolCohortDrift: principalTotal,
    surplusCohortDrift: surplusSliceTotal,
  };
}

/** Legacy status-based cohort expectation (excludes forfeited from gross subs). */
export async function computeCohortExpectedLedger(): Promise<{
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

  let poolAvailable = subscribed.reduce((sum, inv) => sum + inv.amountUsdt, 0);
  for (const inv of redeemedInvestments) {
    poolAvailable -= inv.projectedPayoutUsdt || 0;
  }
  poolAvailable -= withdrawals.reduce((sum, row) => sum + row.amountUsdt, 0);
  poolAvailable = ledgerTruncateUsdt(Math.max(0, poolAvailable));

  const protectedRevenueWithdrawn = ledgerTruncateUsdt(
    withdrawals.reduce((sum, row) => sum + row.amountUsdt, 0)
  );

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

/** @deprecated Use computeCohortExpectedLedger — legacy status-based formula. */
export async function computeExpectedLedger(): Promise<{
  expected: ExpectedLedgerValues;
  confirmedSubscriptionCount: number;
  investmentSampleIds: string[];
  purchaseOrdersWithUsdtTxId: number;
}> {
  return computeCohortExpectedLedger();
}

/** Read-only: compare stored ledger to event replay and cohort expectations. */
export async function buildLedgerIntegrityReport(): Promise<LedgerIntegrityReport> {
  const stored = ledgerFields(await getOrCreateLedger());
  const [
    expected,
    cohortResult,
    forfeitureImpact,
    treasuryEventCount,
    appRevenueWithdrawalCount,
  ] = await Promise.all([
    computeExpectedLedgerFromEvents(),
    computeCohortExpectedLedger(),
    computeForfeitureImpact(),
    prisma.treasuryEvent.count(),
    prisma.appRevenueWithdrawal.count(),
  ]);

  return {
    confirmedSubscriptionCount: cohortResult.confirmedSubscriptionCount,
    mismatch: fieldsMismatch(stored, expected),
    cohortMismatch: fieldsMismatch(stored, cohortResult.expected),
    purchaseOrdersWithUsdtTxId: cohortResult.purchaseOrdersWithUsdtTxId,
    treasuryEventCount,
    appRevenueWithdrawalCount,
    investmentSampleIds: cohortResult.investmentSampleIds,
    stored,
    expected,
    cohortExpected: cohortResult.expected,
    forfeitureImpact,
  };
}

export async function reconcileTreasurySurplusFromTriads(): Promise<{
  updated: boolean;
  stored: number;
  expected: number;
  delta: number;
}> {
  const ledger = await getOrCreateLedger();
  const { expected } = await computeCohortExpectedLedger();
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
  const expected = await computeExpectedLedgerFromEvents();
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
      ? "Stored ledger differs from event replay; investigate treasury events"
      : report.cohortMismatch
        ? "Stored matches event replay; cohort formula differs (often forfeited principal retained in pool)"
        : "Stored ledger matches event replay and cohort expectations",
  });
}
