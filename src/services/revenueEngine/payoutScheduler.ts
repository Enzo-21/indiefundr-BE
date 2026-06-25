import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  type Investment,
} from "@prisma/client";
import { isExcludedFromNormalPayout } from "@/lib/investments/referralRecoveryNormalPayout";
import {
  unlockPrincipalRequired,
  unlockSlotEquivalent,
} from "@/lib/config/investmentCohort";
import { INVESTMENT_AMOUNT_USDT, REVENUE_ENGINE_ENABLED } from "@/lib/config/revenueEngine";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { prisma } from "@/lib/prisma";
import { fieldIsNullOrUnset } from "@/lib/prisma/mongoFieldFilters";
import {
  getLedgerSnapshot,
  type LedgerSnapshot,
} from "@/services/revenueEngine/ledger";
import * as tron from "@/services/tron/client";
import {
  PayoutInProgressError,
  withGlobalPayoutLock,
} from "./payoutLock";

export const PAYOUT_CANDIDATE_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.active,
  InvestmentStatus.matured,
];

const INVESTED_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.active,
  InvestmentStatus.matured,
  InvestmentStatus.redeeming,
  InvestmentStatus.redeemed,
];

export type { PayoutTrigger } from "./payoutTriggers";
export { isSurplusPayoutTrigger } from "./payoutTriggers";
import {
  isSurplusPayoutTrigger,
  type PayoutTrigger,
} from "./payoutTriggers";

export type PayoutUnlocker = Pick<
  Investment,
  "id" | "userId" | "subscribedAt" | "excludedFromTriadUnlock" | "amountUsdt"
> & {
  user?: { name: string; email: string };
};

function isPayoutCandidateStatus(status: InvestmentStatus): boolean {
  return PAYOUT_CANDIDATE_STATUSES.includes(status);
}

export function getSurplusPayoutAvailableAt(
  investment: Pick<Investment, "maturesAt">
): Date | null {
  return investment.maturesAt ?? null;
}

export function getSurplusPayoutEligibility(
  investment: Pick<
    Investment,
    | "status"
    | "maturesAt"
    | "projectedPayoutUsdt"
    | "payoutUnlockedAt"
    | "redemptionTransaction"
    | "unpaidMaturityResolution"
    | "referralRecoveryCompletedAt"
  >,
  ledger: Pick<LedgerSnapshot, "treasurySurplus">,
  _now = new Date()
) {
  if (isExcludedFromNormalPayout(investment)) {
    return {
      eligibleForLiquiditySurplusPay: false,
      eligibleForAdminSurplusPay: false,
      eligibleForCronSurplusPay: false,
      surplusShortfallUsdt: 0,
      surplusPayoutAvailableAt: getSurplusPayoutAvailableAt(investment),
      reason: "referral_recovery_path" as const,
    };
  }

  const payoutAmount = Number(investment.projectedPayoutUsdt || 0);
  const shortfall = Math.max(
    0,
    payoutAmount - Number(ledger.treasurySurplus || 0)
  );
  const surplusShortfallUsdt = Math.round(shortfall * 1e6) / 1e6;
  const candidate = isPayoutCandidateStatus(investment.status);
  const hasEnoughSurplus = surplusShortfallUsdt <= 0;
  const blockedByNormalUnlock = investment.payoutUnlockedAt != null;
  const blockedByRedemption = investment.redemptionTransaction != null;
  const surplusPayoutAvailableAt = getSurplusPayoutAvailableAt(investment);

  let reason = "not_available";
  if (investment.status === InvestmentStatus.redeemed) {
    reason = "paid";
  } else if (investment.status === InvestmentStatus.redeeming) {
    reason = "paying";
  } else if (!candidate) {
    reason = "not_payable_status";
  } else if (blockedByNormalUnlock) {
    reason = "normal_payout_unlocked";
  } else if (blockedByRedemption) {
    reason = "redemption_in_progress";
  } else if (!hasEnoughSurplus) {
    reason = "insufficient_surplus";
  } else {
    reason = "liquidity_fifo_eligible";
  }

  const liquidityEligible =
    candidate &&
    !blockedByNormalUnlock &&
    !blockedByRedemption &&
    hasEnoughSurplus;

  return {
    eligibleForLiquiditySurplusPay: liquidityEligible,
    /** @deprecated Use eligibleForLiquiditySurplusPay (FIFO when surplus ≥ payout). */
    eligibleForAdminSurplusPay: liquidityEligible,
    /** @deprecated Use eligibleForLiquiditySurplusPay. */
    eligibleForCronSurplusPay: liquidityEligible,
    surplusShortfallUsdt,
    surplusPayoutAvailableAt,
    reason,
  };
}

export type FifoSurplusPayoutCandidate = Pick<
  Investment,
  | "id"
  | "subscribedAt"
  | "status"
  | "projectedPayoutUsdt"
  | "payoutUnlockedAt"
  | "redemptionTransaction"
  | "maturesAt"
  | "unpaidMaturityResolution"
  | "referralRecoveryCompletedAt"
>;

function sortFifoSurplusCandidates(
  investments: FifoSurplusPayoutCandidate[]
): FifoSurplusPayoutCandidate[] {
  return [...investments].sort((a, b) => {
    const aTime = a.subscribedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.subscribedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return a.id.localeCompare(b.id);
  });
}

function passesSurplusPayoutPreconditions(
  investment: FifoSurplusPayoutCandidate,
  now = new Date()
): boolean {
  const eligibility = getSurplusPayoutEligibility(
    investment,
    { treasurySurplus: Number.MAX_SAFE_INTEGER },
    now
  );
  return (
    eligibility.reason === "liquidity_fifo_eligible" ||
    eligibility.reason === "insufficient_surplus"
  );
}

/** Investments eligible for surplus pay in subscribe-date FIFO order within treasury surplus. */
export function computeFifoSurplusEligibleInvestmentIds(
  investments: FifoSurplusPayoutCandidate[],
  ledger: Pick<LedgerSnapshot, "treasurySurplus">,
  now = new Date()
): Set<string> {
  const ordered = sortFifoSurplusCandidates(investments);
  let remaining = ledgerTruncateUsdt(Number(ledger.treasurySurplus || 0));
  const eligible = new Set<string>();

  for (const investment of ordered) {
    if (isExcludedFromNormalPayout(investment)) {
      continue;
    }
    if (!passesSurplusPayoutPreconditions(investment, now)) {
      continue;
    }

    const payout = ledgerTruncateUsdt(Number(investment.projectedPayoutUsdt || 0));
    if (payout <= 0) {
      continue;
    }
    if (payout > remaining) {
      break;
    }

    eligible.add(investment.id);
    remaining = ledgerTruncateUsdt(remaining - payout);
  }

  return eligible;
}

export function getSurplusPayoutEligibilityWithFifo(
  investment: FifoSurplusPayoutCandidate,
  ledger: Pick<LedgerSnapshot, "treasurySurplus">,
  fifoEligibleIds: ReadonlySet<string>,
  now = new Date()
) {
  const base = getSurplusPayoutEligibility(investment, ledger, now);
  if (
    base.reason === "liquidity_fifo_eligible" &&
    !fifoEligibleIds.has(investment.id)
  ) {
    return {
      ...base,
      eligibleForLiquiditySurplusPay: false,
      eligibleForAdminSurplusPay: false,
      eligibleForCronSurplusPay: false,
      reason: "fifo_surplus_blocked" as const,
    };
  }
  return base;
}

/** Earliest subscribedAt candidate that can be paid from current treasury surplus. */
export function pickNextFifoSurplusPayoutInvestmentId(
  investments: FifoSurplusPayoutCandidate[],
  ledger: Pick<LedgerSnapshot, "treasurySurplus">,
  now = new Date()
): string | null {
  const eligible = computeFifoSurplusEligibleInvestmentIds(
    investments,
    ledger,
    now
  );
  for (const investment of sortFifoSurplusCandidates(investments)) {
    if (eligible.has(investment.id)) {
      return investment.id;
    }
  }
  return null;
}

export function findUnlockingInvestments<T extends PayoutUnlocker>(
  candidate: Pick<Investment, "id" | "userId" | "subscribedAt" | "amountUsdt">,
  investments: T[],
  consumedUnlockingInvestmentIds: ReadonlySet<string> = new Set()
): T[] {
  if (!candidate.subscribedAt) return [];

  const headAmount =
    candidate.amountUsdt > 0
      ? candidate.amountUsdt
      : INVESTMENT_AMOUNT_USDT();
  const requiredPrincipal = unlockPrincipalRequired(headAmount);
  let receivedPrincipal = 0;
  const selected: T[] = [];

  for (const investment of investments) {
    if (!investment.subscribedAt) continue;
    if (investment.id === candidate.id) continue;
    if (consumedUnlockingInvestmentIds.has(investment.id)) continue;
    if (investment.subscribedAt <= candidate.subscribedAt) continue;
    if (investment.excludedFromTriadUnlock) continue;

    const unlockerAmount =
      investment.amountUsdt > 0
        ? investment.amountUsdt
        : INVESTMENT_AMOUNT_USDT();
    selected.push(investment);
    receivedPrincipal += unlockerAmount;
    if (receivedPrincipal >= requiredPrincipal) {
      break;
    }
  }

  return receivedPrincipal >= requiredPrincipal ? selected : [];
}

export function buildPayoutReadinessClaimWhere(investmentId: string) {
  return {
    AND: [
      { id: investmentId },
      { status: { in: PAYOUT_CANDIDATE_STATUSES } },
      fieldIsNullOrUnset("payoutUnlockedAt"),
    ],
  };
}

export function buildSurplusPayoutClaimWhere(investmentId: string) {
  return buildPayoutReadinessClaimWhere(investmentId);
}

export function buildPayoutReason(
  headAmountUsdt: number,
  unlockers: PayoutUnlocker[]
): string | null {
  if (unlockers.length === 0) {
    return null;
  }

  const required = unlockPrincipalRequired(headAmountUsdt);
  const received = unlockers.reduce(
    (sum, inv) => sum + (inv.amountUsdt || 0),
    0
  );
  const equivalent = unlockSlotEquivalent(received, headAmountUsdt);
  const amountParts = unlockers
    .map((inv) => `${inv.amountUsdt} USDT`)
    .join(" + ");
  const countLabel =
    unlockers.length === 1
      ? "1 later investment"
      : `${unlockers.length} later investments`;

  return (
    `Unlocked after ${countLabel} (${amountParts}). ` +
    `Head invested ${headAmountUsdt} USDT; required ${required} USDT from newer investors (2× cohort). ` +
    `Received ${received} USDT (${equivalent}× equivalent).`
  );
}

function hasBroadcastRedemption(result: { investment: Investment }) {
  return (
    result.investment.status === InvestmentStatus.redeeming &&
    result.investment.redemptionTransaction != null
  );
}

export async function evaluatePayoutReadiness({
  now = new Date(),
  limit,
}: {
  now?: Date;
  limit?: number;
} = {}): Promise<{ updated: number }> {
  if (!REVENUE_ENGINE_ENABLED()) {
    return { updated: 0 };
  }

  const investments = await prisma.investment.findMany({
    where: {
      status: { in: INVESTED_STATUSES },
      subscribedAt: { not: null },
    },
    orderBy: { subscribedAt: "asc" },
    include: { user: { select: { name: true, email: true } } },
  });

  const candidates = investments.filter(
    (inv) =>
      PAYOUT_CANDIDATE_STATUSES.includes(inv.status) &&
      !inv.payoutUnlockedAt &&
      !inv.redemptionTransaction &&
      !isExcludedFromNormalPayout(inv)
  );
  const consumedUnlockingInvestmentIds = new Set(
    investments.flatMap((inv) => inv.payoutUnlockingInvestmentIds)
  );

  let updated = 0;
  for (const candidate of candidates) {
    if (limit != null && updated >= limit) break;

    const unlockers = findUnlockingInvestments(
      candidate,
      investments,
      consumedUnlockingInvestmentIds
    );
    if (unlockers.length === 0) {
      continue;
    }

    const principalRequired = unlockPrincipalRequired(candidate.amountUsdt);
    const principalReceived = unlockers.reduce(
      (sum, inv) => sum + (inv.amountUsdt || 0),
      0
    );

    const result = await prisma.investment.updateMany({
      where: buildPayoutReadinessClaimWhere(candidate.id),
      data: {
        payabilityStatus: InvestmentPayabilityStatus.payable,
        payoutUnlockedAt: now,
        payoutUnlockingInvestmentIds: unlockers.map((inv) => inv.id),
        payoutUnlockingUserIds: unlockers.map((inv) => inv.userId),
        payoutUnlockPrincipalRequiredUsdt: principalRequired,
        payoutUnlockPrincipalReceivedUsdt: principalReceived,
        payoutReason: buildPayoutReason(candidate.amountUsdt, unlockers),
        payoutFailureReason: null,
      },
    });
    if (result.count !== 1) {
      continue;
    }

    for (const unlocker of unlockers) {
      consumedUnlockingInvestmentIds.add(unlocker.id);
    }
    updated += 1;
  }

  return { updated };
}

async function executeInvestmentPayoutUnlocked(
  investmentId: string,
  trigger: PayoutTrigger
) {
  const { claimNormalPayout, broadcastInvestmentPayoutUsdt } = await import(
    "@/services/admin/investmentPayoutFulfillment"
  );

  const claim = await claimNormalPayout(investmentId, trigger);
  if (claim.investment.status === InvestmentStatus.redeemed) {
    return { investment: claim.investment, alreadyPaid: true };
  }

  const broadcast = await broadcastInvestmentPayoutUsdt(investmentId);
  return {
    investment: broadcast.investment,
    alreadyPaid: broadcast.alreadyBroadcast && claim.alreadyClaimed,
  };
}

export async function executeInvestmentPayout(
  investmentId: string,
  trigger: PayoutTrigger
) {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: { status: true },
  });

  if (!investment) {
    throw new Error("Investment not found");
  }

  if (investment.status === InvestmentStatus.redeemed) {
    const paid = await prisma.investment.findUniqueOrThrow({
      where: { id: investmentId },
    });
    return { investment: paid, alreadyPaid: true };
  }

  if (investment.status === InvestmentStatus.redeeming) {
    const paying = await prisma.investment.findUniqueOrThrow({
      where: { id: investmentId },
    });
    return { investment: paying, alreadyPaying: true };
  }

  return withGlobalPayoutLock(
    investmentId,
    trigger,
    () => executeInvestmentPayoutUnlocked(investmentId, trigger),
    { keepLockOnSuccess: hasBroadcastRedemption }
  );
}

type SurplusLiquidityTrigger = Extract<
  PayoutTrigger,
  | "admin_surplus"
  | "cron_surplus"
  | "admin_surplus_liquidity"
  | "cron_surplus_liquidity"
>;

async function executeSurplusInvestmentPayoutUnlocked(
  investmentId: string,
  trigger: SurplusLiquidityTrigger,
  { now = new Date() }: { now?: Date } = {}
) {
  const { prepareSurplusPayout, broadcastInvestmentPayoutUsdt } = await import(
    "@/services/admin/investmentPayoutFulfillment"
  );

  const prepared = await prepareSurplusPayout(investmentId, trigger);
  if (prepared.investment.status === InvestmentStatus.redeemed) {
    return { investment: prepared.investment, alreadyPaid: true };
  }

  const broadcast = await broadcastInvestmentPayoutUsdt(investmentId);
  return {
    investment: broadcast.investment,
    alreadyPaid: false,
  };
}

export async function executeSurplusInvestmentPayout(
  investmentId: string,
  trigger: SurplusLiquidityTrigger,
  { now = new Date() }: { now?: Date } = {}
) {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: { status: true },
  });

  if (!investment) {
    throw new Error("Investment not found");
  }

  if (investment.status === InvestmentStatus.redeemed) {
    const paid = await prisma.investment.findUniqueOrThrow({
      where: { id: investmentId },
    });
    return { investment: paid, alreadyPaid: true };
  }

  if (investment.status === InvestmentStatus.redeeming) {
    const paying = await prisma.investment.findUniqueOrThrow({
      where: { id: investmentId },
    });
    return { investment: paying, alreadyPaying: true };
  }

  return withGlobalPayoutLock(
    investmentId,
    trigger,
    () => executeSurplusInvestmentPayoutUnlocked(investmentId, trigger, { now }),
    { keepLockOnSuccess: hasBroadcastRedemption }
  );
}

/** @deprecated Automatic payouts removed — use admin Pay now from Investments table. */
export async function processDueAutomaticPayouts(_options?: {
  now?: Date;
  limit?: number;
}): Promise<{
  processed: number;
  failed: number;
  skipped: number;
}> {
  return { processed: 0, failed: 0, skipped: 0 };
}

/** @deprecated Surplus liquidity cron removed — use admin Pay with surplus. */
export async function processSurplusLiquidityPayouts(_options?: {
  limit?: number;
  trigger?: SurplusLiquidityTrigger;
}): Promise<{
  processed: number;
  failed: number;
  skipped: number;
}> {
  return { processed: 0, failed: 0, skipped: 0 };
}
