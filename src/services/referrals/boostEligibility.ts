import { InvestmentStatus, type Investment } from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import {
  boostExpiresAt,
  getBoostInviteesRequired,
  isBoostWindowActive,
  REFERRAL_BOOST_WINDOW_DAYS,
} from "@/lib/config/referralBoost";
import { fieldIsNullOrUnset } from "@/lib/prisma/mongoFieldFilters";
import { prisma } from "@/lib/prisma";

export type BoostContextPayload = {
  investmentId: string;
  fundName: string;
  qualifiedCount: number;
  requiredCount: number;
  principalUsdt: number;
  projectedPayoutUsdt: number;
  boostActivatedAt: string;
  boostExpiresAt: string;
  windowDays: number;
};

function openBoostWhere(userId: string) {
  return {
    AND: [
      { userId },
      { status: InvestmentStatus.active },
      { boostActivatedAt: { not: null } },
      fieldIsNullOrUnset("boostCompletedAt"),
    ],
  };
}

export function isOpenBoostInvestment(
  investment: Pick<
    Investment,
    | "status"
    | "boostActivatedAt"
    | "boostCompletedAt"
    | "redeemedAt"
    | "payoutUnlockedAt"
  >,
  now: Date = new Date()
): boolean {
  if (investment.status !== InvestmentStatus.active) return false;
  if (!investment.boostActivatedAt) return false;
  if (investment.boostCompletedAt) return false;
  if (investment.redeemedAt) return false;
  return isBoostWindowActive(investment.boostActivatedAt, now);
}

function buildBoostPayload(
  investment: Pick<
    Investment,
    | "id"
    | "fundId"
    | "amountUsdt"
    | "projectedPayoutUsdt"
    | "boostActivatedAt"
  >,
  qualifiedCount: number
): BoostContextPayload | null {
  if (!investment.boostActivatedAt) return null;
  if (!isBoostWindowActive(investment.boostActivatedAt)) return null;

  const fund = getFundById(investment.fundId);
  const eligibleAt = investment.boostActivatedAt;

  return {
    investmentId: investment.id,
    fundName: fund?.name ?? investment.fundId,
    qualifiedCount,
    requiredCount: getBoostInviteesRequired(investment.amountUsdt),
    principalUsdt: investment.amountUsdt,
    projectedPayoutUsdt: investment.projectedPayoutUsdt,
    boostActivatedAt: eligibleAt.toISOString(),
    boostExpiresAt: boostExpiresAt(eligibleAt).toISOString(),
    windowDays: REFERRAL_BOOST_WINDOW_DAYS(),
  };
}

/**
 * Oldest open Boost on an active investment for this inviter (FIFO).
 */
export async function getBoostContextForInviter(userId: string) {
  const investment = await prisma.investment.findFirst({
    where: openBoostWhere(userId),
    orderBy: [{ boostActivatedAt: "asc" }, { subscribedAt: "asc" }],
  });

  if (!investment?.boostActivatedAt) {
    return { mode: "standard" as const, boost: null };
  }

  if (!isBoostWindowActive(investment.boostActivatedAt)) {
    return { mode: "standard" as const, boost: null };
  }

  const link = await prisma.referralBoostLink.findUnique({
    where: { investmentId: investment.id },
  });

  if (link?.cancelledAt || link?.completedAt) {
    return { mode: "standard" as const, boost: null };
  }

  const boost = buildBoostPayload(investment, link?.inviteIds.length ?? 0);
  if (!boost) {
    return { mode: "standard" as const, boost: null };
  }

  return { mode: "boost" as const, boost };
}

export async function getBoostLinkForInvestment(investmentId: string) {
  return prisma.referralBoostLink.findUnique({
    where: { investmentId },
  });
}
