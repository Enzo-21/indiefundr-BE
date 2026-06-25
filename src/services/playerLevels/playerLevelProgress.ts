import {
  InvestmentStatus,
  ReferralInviteStatus,
  ReferralRewardRole,
  ReferralRewardStatus,
} from "@prisma/client";
import { normalizePlayerLevel } from "@/lib/config/playerLevels";
import { prisma } from "@/lib/prisma";

const COMPLETED_INVESTMENT_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.redeemed,
  InvestmentStatus.referral_recovered,
];

export type PlayerLevelStats = {
  lifetimeInvestmentCount: number;
  completedInvestmentCount: number;
  redeemedCount: number;
  distinctFundsInvested: number;
  qualifiedReferralCount: number;
  qualifiedInviterBonusReferralCount: number;
};

export type PlayerLevelRecalculationResult = {
  previousLevel: number;
  newLevel: number;
  changed: boolean;
  stats: PlayerLevelStats;
};

export function meetsLevelRequirements(
  level: number,
  stats: PlayerLevelStats
): boolean {
  switch (level) {
    case 1:
      return (
        stats.completedInvestmentCount >= 1 && stats.lifetimeInvestmentCount >= 3
      );
    case 2:
      return (
        stats.distinctFundsInvested >= 2 && stats.completedInvestmentCount >= 3
      );
    case 3:
      return stats.redeemedCount >= 1 && stats.completedInvestmentCount >= 5;
    case 4:
      return stats.qualifiedReferralCount >= 1;
    case 5:
      return (
        stats.distinctFundsInvested >= 4 &&
        stats.completedInvestmentCount >= 10 &&
        stats.qualifiedInviterBonusReferralCount >= 3
      );
    default:
      return level <= 0;
  }
}

export function computeEarnedLevel(stats: PlayerLevelStats): number {
  let earned = 0;
  for (let level = 1; level <= 5; level += 1) {
    if (!meetsLevelRequirements(level, stats)) {
      break;
    }
    earned = level;
  }
  return earned;
}

export async function loadPlayerLevelStats(
  userId: string
): Promise<PlayerLevelStats> {
  const [
    lifetimeInvestmentCount,
    completedInvestmentCount,
    redeemedCount,
    subscribedFunds,
    qualifiedReferralCount,
    qualifiedInviterBonusReferralCount,
  ] = await Promise.all([
    prisma.investment.count({
      where: { userId, subscribedAt: { not: null } },
    }),
    prisma.investment.count({
      where: {
        userId,
        status: { in: COMPLETED_INVESTMENT_STATUSES },
      },
    }),
    prisma.investment.count({
      where: { userId, status: InvestmentStatus.redeemed },
    }),
    prisma.investment.findMany({
      where: { userId, subscribedAt: { not: null } },
      select: { fundId: true },
      distinct: ["fundId"],
    }),
    prisma.referralInvite.count({
      where: {
        inviterUserId: userId,
        status: ReferralInviteStatus.qualified,
      },
    }),
    prisma.referralInvite.count({
      where: {
        inviterUserId: userId,
        status: ReferralInviteStatus.qualified,
        rewards: {
          some: {
            role: ReferralRewardRole.inviter_bonus,
            status: {
              in: [
                ReferralRewardStatus.pending,
                ReferralRewardStatus.credited,
              ],
            },
          },
        },
      },
    }),
  ]);

  return {
    lifetimeInvestmentCount,
    completedInvestmentCount,
    redeemedCount,
    distinctFundsInvested: subscribedFunds.length,
    qualifiedReferralCount,
    qualifiedInviterBonusReferralCount,
  };
}

export async function recalculateUserLevel(
  userId: string
): Promise<PlayerLevelRecalculationResult> {
  const [user, stats] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { level: true },
    }),
    loadPlayerLevelStats(userId),
  ]);

  const previousLevel = normalizePlayerLevel(user?.level);
  const earnedLevel = computeEarnedLevel(stats);
  const newLevel = Math.max(previousLevel, earnedLevel);

  if (newLevel !== previousLevel) {
    await prisma.user.update({
      where: { id: userId },
      data: { level: newLevel },
    });
  }

  return {
    previousLevel,
    newLevel,
    changed: newLevel !== previousLevel,
    stats,
  };
}
