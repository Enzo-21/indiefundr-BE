import {
  APP_NET_REVENUE_PER_SUBSCRIBER_USDT,
  INVESTMENT_AMOUNT_USDT,
  roundUsdt,
} from "@/lib/config/revenueEngine";
import {
  surplusPerSubscription,
  triadSurplusForPayout,
} from "./accounting";
import type { ExpectedLedgerValues } from "./ledgerReconcile";
import { findUnlockingInvestments } from "./payoutScheduler";

export { triadSurplusForPayout, surplusPerSubscription };

export type SimulatedInvestment = {
  id: string;
  userId: string;
  subscribedAt: Date;
  projectedPayoutUsdt: number;
};

/** Mirrors evaluatePayoutReadiness unlock selection (in-memory, no DB). */
export function simulatePayoutReadinessUnlocks(
  investments: SimulatedInvestment[]
): Array<{
  headId: string;
  unlockerIds: [string, string];
}> {
  const ordered = [...investments].sort(
    (a, b) => a.subscribedAt.getTime() - b.subscribedAt.getTime()
  );
  const consumedUnlockingInvestmentIds = new Set<string>();
  const unlocked: Array<{ headId: string; unlockerIds: [string, string] }> = [];

  for (const candidate of ordered) {
    const unlockers = findUnlockingInvestments(
      candidate,
      ordered,
      consumedUnlockingInvestmentIds
    );
    if (unlockers.length < 2) continue;

    for (const unlocker of unlockers) {
      consumedUnlockingInvestmentIds.add(unlocker.id);
    }
    unlocked.push({
      headId: candidate.id,
      unlockerIds: [unlockers[0]!.id, unlockers[1]!.id],
    });
  }

  return unlocked;
}

export type CohortLedgerProjection = {
  investmentCount: number;
  triadCount: number;
  grossSubscribed: number;
  protectedCredited: number;
  totalPayouts: number;
  totalSurplusCredited: number;
  poolAfterPayouts: number;
  platformWithdrawn: number;
};

export function projectCohortLedger({
  investmentCount,
  payoutPerHead,
  platformWithdrawn = 0,
}: {
  investmentCount: number;
  payoutPerHead: number;
  platformWithdrawn?: number;
}): CohortLedgerProjection {
  const principal = INVESTMENT_AMOUNT_USDT();
  const platformPerInvestment = APP_NET_REVENUE_PER_SUBSCRIBER_USDT();
  const surplusPerSub = surplusPerSubscription(payoutPerHead);
  const triadCount = Math.max(0, Math.floor((investmentCount - 1) / 2));
  const grossSubscribed = investmentCount * principal;
  const protectedCredited = investmentCount * platformPerInvestment;
  const totalPayouts = triadCount * payoutPerHead;
  const totalSurplusCredited = investmentCount * surplusPerSub;

  return {
    investmentCount,
    triadCount,
    grossSubscribed,
    protectedCredited,
    totalPayouts,
    totalSurplusCredited,
    poolAfterPayouts: grossSubscribed - totalPayouts - platformWithdrawn,
    platformWithdrawn,
  };
}

/** Mirrors `computeExpectedLedger()` for a closed cohort with T complete triad payouts. */
export function cohortToExpectedLedger(
  projection: CohortLedgerProjection
): ExpectedLedgerValues {
  return {
    poolAvailable: roundUsdt(Math.max(0, projection.poolAfterPayouts)),
    treasurySurplus: roundUsdt(projection.totalSurplusCredited),
    protectedRevenueWithdrawn: roundUsdt(projection.platformWithdrawn),
  };
}

export function buildSequentialCohort(
  count: number,
  options: {
    payoutUsdt?: number;
    startMs?: number;
    msStep?: number;
  } = {}
): SimulatedInvestment[] {
  const payoutUsdt = options.payoutUsdt ?? 35;
  const startMs = options.startMs ?? Date.UTC(2026, 0, 1);
  const msStep = options.msStep ?? 60_000;

  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return {
      id: `inv-${n}`,
      userId: `user-${n}`,
      subscribedAt: new Date(startMs + index * msStep),
      projectedPayoutUsdt: payoutUsdt,
    };
  });
}
