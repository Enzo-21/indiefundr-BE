import { InvestmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFundById } from "@/lib/config/investmentFunds";
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
];

export async function isReferralRecoveryEligible(
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
): Promise<boolean> {
  if (investment.status !== InvestmentStatus.matured) return false;
  if (investment.payoutUnlockedAt) return false;
  if (investment.referralRecoveryCompletedAt) return false;
  if (BLOCKED_STATUSES.includes(investment.status)) return false;
  if (fifoEligibleIds.has(investment.id)) return false;
  return true;
}

export async function refreshRecoveryEligibilityForUser(userId: string) {
  await markMaturedInvestments();

  const investments = await prisma.investment.findMany({
    where: {
      userId,
      status: InvestmentStatus.matured,
      payoutUnlockedAt: null,
      referralRecoveryCompletedAt: null,
    },
    select: {
      id: true,
      status: true,
      payoutUnlockedAt: true,
      referralRecoveryCompletedAt: true,
      recoveryEligibleAt: true,
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
    },
  });

  const fifoIds = computeFifoSurplusEligibleInvestmentIds(allMatured, ledger);

  const now = new Date();
  for (const investment of investments) {
    const eligible = await isReferralRecoveryEligible(investment, fifoIds);
    await prisma.investment.update({
      where: { id: investment.id },
      data: {
        recoveryEligibleAt: eligible ? investment.recoveryEligibleAt ?? now : null,
      },
    });
  }
}

export async function getRecoveryContextForInviter(userId: string) {
  await refreshRecoveryEligibilityForUser(userId);

  const investment = await prisma.investment.findFirst({
    where: {
      userId,
      status: InvestmentStatus.matured,
      recoveryEligibleAt: { not: null },
      referralRecoveryCompletedAt: null,
    },
    orderBy: [{ recoveryEligibleAt: "asc" }, { subscribedAt: "asc" }],
  });

  if (!investment) {
    return { mode: "standard" as const, recovery: null };
  }

  const link = await prisma.referralRecoveryLink.findUnique({
    where: { investmentId: investment.id },
  });

  const qualifiedCount = link?.inviteIds.length ?? 0;
  const fund = getFundById(investment.fundId);

  return {
    mode: "recovery" as const,
    recovery: {
      investmentId: investment.id,
      fundName: fund?.name ?? investment.fundId,
      qualifiedCount,
      requiredCount: 2,
      principalUsdt: investment.amountUsdt,
    },
  };
}
