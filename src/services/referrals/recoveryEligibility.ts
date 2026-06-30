import { InvestmentStatus, UnpaidMaturityResolution } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fieldIsNullOrUnset } from "@/lib/prisma/mongoFieldFilters";
import { getFundById } from "@/lib/config/investmentFunds";
import {
  isRecoveryWindowActive,
  REFERRAL_RECOVERY_INVITEES_REQUIRED,
  REFERRAL_RECOVERY_WINDOW_DAYS,
  recoveryExpiresAt,
} from "@/lib/config/referralRecovery";
import {
  computeFifoSurplusEligibleInvestmentIds,
} from "@/services/revenueEngine/payoutScheduler";
import { getLedgerSnapshot } from "@/services/revenueEngine/ledger";
import { markMaturedInvestments } from "@/services/investments/maturity";
import type { Investment } from "@prisma/client";

const BLOCKED_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.redeeming,
  InvestmentStatus.redeemed,
  InvestmentStatus.referral_recovered,
  InvestmentStatus.forfeited,
  InvestmentStatus.failed,
];

function recoveryInProgressWhere(userId: string) {
  return {
    AND: [
      { userId },
      { status: InvestmentStatus.matured },
      { recoveryEligibleAt: { not: null } },
      fieldIsNullOrUnset("referralRecoveryCompletedAt"),
      { unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery },
    ],
  };
}

function maturedAwaitingRecoveryRefreshWhere(userId: string) {
  return {
    AND: [
      { userId },
      { status: InvestmentStatus.matured },
      fieldIsNullOrUnset("payoutUnlockedAt"),
      fieldIsNullOrUnset("referralRecoveryCompletedAt"),
    ],
  };
}

export type RecoveryContextPayload = {
  investmentId: string;
  fundName: string;
  qualifiedCount: number;
  requiredCount: number;
  principalUsdt: number;
  recoveryEligibleAt: string;
  recoveryExpiresAt: string;
  windowDays: number;
};

export function isRecoveryCandidate(
  investment: Pick<
    Investment,
    | "id"
    | "status"
    | "payoutUnlockedAt"
    | "referralRecoveryCompletedAt"
    | "subscribedAt"
    | "projectedPayoutUsdt"
    | "maturesAt"
  >,
  fifoEligibleIds: ReadonlySet<string>
): boolean {
  if (investment.status !== InvestmentStatus.matured) return false;
  if (investment.payoutUnlockedAt) return false;
  if (investment.referralRecoveryCompletedAt) return false;
  if (BLOCKED_STATUSES.includes(investment.status)) return false;
  if (fifoEligibleIds.has(investment.id)) return false;
  return true;
}

export function isReferralRecoveryEligible(
  investment: Pick<
    Investment,
    | "id"
    | "status"
    | "payoutUnlockedAt"
    | "referralRecoveryCompletedAt"
    | "recoveryEligibleAt"
    | "unpaidMaturityResolution"
    | "subscribedAt"
    | "projectedPayoutUsdt"
    | "maturesAt"
  >,
  fifoEligibleIds: ReadonlySet<string>,
  now: Date = new Date()
): boolean {
  const candidate = isRecoveryCandidate(investment, fifoEligibleIds);
  if (!candidate) return false;

  if (
    investment.unpaidMaturityResolution ===
    UnpaidMaturityResolution.term_extension
  ) {
    return false;
  }

  if (investment.unpaidMaturityResolution == null) {
    return false;
  }

  if (!investment.recoveryEligibleAt) return false;
  return isRecoveryWindowActive(investment.recoveryEligibleAt, now);
}

export async function refreshRecoveryEligibilityForUser(userId: string) {
  await markMaturedInvestments();

  const investments = await prisma.investment.findMany({
    where: maturedAwaitingRecoveryRefreshWhere(userId),
    select: {
      id: true,
      status: true,
      payoutUnlockedAt: true,
      referralRecoveryCompletedAt: true,
      recoveryEligibleAt: true,
      unpaidMaturityResolution: true,
      subscribedAt: true,
      projectedPayoutUsdt: true,
      maturesAt: true,
    },
  });

  if (investments.length === 0) return;

  const ledger = await getLedgerSnapshot();
  const allMatured = await prisma.investment.findMany({
    where: { status: InvestmentStatus.matured },
    select: {
      id: true,
      status: true,
      payoutUnlockedAt: true,
      subscribedAt: true,
      projectedPayoutUsdt: true,
      maturesAt: true,
      redemptionTransaction: true,
      unpaidMaturityResolution: true,
      referralRecoveryCompletedAt: true,
      unpaidMaturityChoiceDeadlineAt: true,
    },
  });

  const fifoIds = computeFifoSurplusEligibleInvestmentIds(allMatured, ledger);

  const now = new Date();
  for (const investment of investments) {
    const candidate = isRecoveryCandidate(investment, fifoIds);
    if (!candidate) {
      if (investment.recoveryEligibleAt) {
        await prisma.investment.update({
          where: { id: investment.id },
          data: { recoveryEligibleAt: null },
        });
      }
      continue;
    }

    if (
      investment.unpaidMaturityResolution ===
      UnpaidMaturityResolution.term_extension
    ) {
      if (investment.recoveryEligibleAt) {
        await prisma.investment.update({
          where: { id: investment.id },
          data: { recoveryEligibleAt: null },
        });
      }
      continue;
    }

    if (investment.unpaidMaturityResolution == null) {
      if (investment.recoveryEligibleAt) {
        await prisma.investment.update({
          where: { id: investment.id },
          data: { recoveryEligibleAt: null },
        });
      }
      continue;
    }

    if (investment.recoveryEligibleAt) {
      if (!isRecoveryWindowActive(investment.recoveryEligibleAt, now)) {
        const { forfeitInvestment } = await import(
          "@/services/investments/investmentForfeiture"
        );
        const { ForfeitureReason } = await import("@prisma/client");
        await forfeitInvestment(
          investment.id,
          ForfeitureReason.recovery_window_expired
        );
      }
      continue;
    }

    await prisma.investment.update({
      where: { id: investment.id },
      data: { recoveryEligibleAt: now },
    });
  }
}

function buildRecoveryPayload(
  investment: Pick<Investment, "id" | "fundId" | "amountUsdt" | "recoveryEligibleAt">,
  qualifiedCount: number
): RecoveryContextPayload | null {
  if (!investment.recoveryEligibleAt) return null;
  if (!isRecoveryWindowActive(investment.recoveryEligibleAt)) return null;

  const fund = getFundById(investment.fundId);
  const eligibleAt = investment.recoveryEligibleAt;
  const requiredCount = REFERRAL_RECOVERY_INVITEES_REQUIRED();

  return {
    investmentId: investment.id,
    fundName: fund?.name ?? investment.fundId,
    qualifiedCount,
    requiredCount,
    principalUsdt: investment.amountUsdt,
    recoveryEligibleAt: eligibleAt.toISOString(),
    recoveryExpiresAt: recoveryExpiresAt(eligibleAt).toISOString(),
    windowDays: REFERRAL_RECOVERY_WINDOW_DAYS(),
  };
}

export async function getRecoveryContextForInviter(userId: string) {
  await refreshRecoveryEligibilityForUser(userId);

  const investment = await prisma.investment.findFirst({
    where: recoveryInProgressWhere(userId),
    orderBy: [{ recoveryEligibleAt: "asc" }, { subscribedAt: "asc" }],
  });

  if (!investment?.recoveryEligibleAt) {
    return { mode: "standard" as const, recovery: null };
  }

  if (!isRecoveryWindowActive(investment.recoveryEligibleAt)) {
    return { mode: "standard" as const, recovery: null };
  }

  const link = await prisma.referralRecoveryLink.findUnique({
    where: { investmentId: investment.id },
  });

  const qualifiedCount = link?.inviteIds.length ?? 0;
  const recovery = buildRecoveryPayload(investment, qualifiedCount);

  if (!recovery) {
    return { mode: "standard" as const, recovery: null };
  }

  return {
    mode: "recovery" as const,
    recovery,
  };
}
