import {
  ReferralPayoutOrderKind,
  ReferralRewardRole,
  ReferralRewardStatus,
} from "@prisma/client";
import { REFERRAL_INVITER_BONUS_USDT } from "@/lib/config/referralRecovery";
import { prisma } from "@/lib/prisma";
import { enqueueReferralPayoutOrder } from "@/services/referrals/referralPayoutOrderQueue";

export type CancelBoostReason =
  | "window_expired"
  | "normal_payout"
  | "normal_unlock"
  | "manual";

async function hasIssuedInviterBonus(referralInviteId: string): Promise<boolean> {
  const reward = await prisma.referralReward.findFirst({
    where: {
      referralInviteId,
      role: ReferralRewardRole.inviter_bonus,
      status: {
        in: [ReferralRewardStatus.pending, ReferralRewardStatus.credited],
      },
    },
    select: { id: true },
  });
  return Boolean(reward);
}

/**
 * Cancel an open Boost path: re-open invitee capital to the triad pool and
 * grant standard inviter bonuses for any slot invitees. Card stays consumed.
 */
export async function cancelBoostPath(
  investmentId: string,
  reason: CancelBoostReason,
  now: Date = new Date()
): Promise<{ cancelled: boolean; inviteIdsRestored: number }> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: {
      id: true,
      userId: true,
      boostActivatedAt: true,
      boostCompletedAt: true,
      referralBoostLink: true,
    },
  });

  if (!investment?.boostActivatedAt || investment.boostCompletedAt) {
    return { cancelled: false, inviteIdsRestored: 0 };
  }

  const link = investment.referralBoostLink;
  if (link?.cancelledAt || link?.completedAt) {
    return { cancelled: false, inviteIdsRestored: 0 };
  }

  const inviteIds = link?.inviteIds ?? [];

  await prisma.$transaction(async (tx) => {
    if (link) {
      await tx.referralBoostLink.update({
        where: { id: link.id },
        data: { cancelledAt: now },
      });
    }

    if (inviteIds.length > 0) {
      const invites = await tx.referralInvite.findMany({
        where: { id: { in: inviteIds } },
        select: { id: true, inviteeUserId: true },
      });

      const inviteeUserIds = invites.map((row) => row.inviteeUserId);
      if (inviteeUserIds.length > 0) {
        await tx.investment.updateMany({
          where: {
            userId: { in: inviteeUserIds },
            excludedFromTriadUnlock: true,
            status: { in: ["active", "matured", "pending"] },
          },
          data: { excludedFromTriadUnlock: false },
        });
      }
    }
  });

  let restored = 0;
  for (const inviteId of inviteIds) {
    if (await hasIssuedInviterBonus(inviteId)) {
      continue;
    }
    await enqueueReferralPayoutOrder({
      userId: investment.userId,
      referralInviteId: inviteId,
      kind: ReferralPayoutOrderKind.inviter_bonus,
      amountUsdt: REFERRAL_INVITER_BONUS_USDT(),
    });
    restored += 1;
  }

  void reason;
  return { cancelled: true, inviteIdsRestored: restored };
}

/**
 * Unlock the booster investment for full projected payout once slots are filled.
 */
export async function completeBoostUnlock(
  investmentId: string,
  unlockingInvestmentIds: string[],
  unlockingUserIds: string[],
  now: Date = new Date()
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const link = await tx.referralBoostLink.findUnique({
      where: { investmentId },
    });
    if (!link || link.completedAt || link.cancelledAt) {
      return;
    }

    await tx.referralBoostLink.update({
      where: { id: link.id },
      data: { completedAt: now },
    });

    await tx.investment.update({
      where: { id: investmentId },
      data: {
        boostCompletedAt: now,
        payoutUnlockedAt: now,
        payoutUnlockingInvestmentIds: unlockingInvestmentIds,
        payoutUnlockingUserIds: unlockingUserIds,
        payoutReason: "boost",
        payoutUnlockPrincipalRequiredUsdt: null,
        payoutUnlockPrincipalReceivedUsdt: null,
      },
    });
  });
}

export async function processExpiredBoostWindows(options?: {
  limit?: number;
  now?: Date;
}): Promise<{ expired: number; investmentIds: string[] }> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 50;

  const candidates = await prisma.investment.findMany({
    where: {
      status: "active",
      boostActivatedAt: { not: null },
      boostCompletedAt: null,
    },
    orderBy: { boostActivatedAt: "asc" },
    take: limit * 3,
    select: {
      id: true,
      boostActivatedAt: true,
      referralBoostLink: {
        select: { cancelledAt: true, completedAt: true },
      },
    },
  });

  const { isBoostWindowActive } = await import("@/lib/config/referralBoost");
  const expiredIds: string[] = [];

  for (const row of candidates) {
    if (expiredIds.length >= limit) break;
    if (row.referralBoostLink?.cancelledAt || row.referralBoostLink?.completedAt) {
      continue;
    }
    if (isBoostWindowActive(row.boostActivatedAt, now)) {
      continue;
    }
    const result = await cancelBoostPath(row.id, "window_expired", now);
    if (result.cancelled) {
      expiredIds.push(row.id);
    }
  }

  return { expired: expiredIds.length, investmentIds: expiredIds };
}

/**
 * If an investment had an open Boost but progressed via the normal triad/FIFO
 * payout path, cancel Boost so slot invitees get standard referral treatment.
 */
export async function maybeCancelOpenBoostForNormalFlow(
  investmentId: string,
  reason: Extract<CancelBoostReason, "normal_payout" | "normal_unlock"> = "normal_unlock"
): Promise<void> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: {
      boostActivatedAt: true,
      boostCompletedAt: true,
      payoutReason: true,
      referralBoostLink: {
        select: { cancelledAt: true, completedAt: true },
      },
    },
  });

  if (!investment?.boostActivatedAt || investment.boostCompletedAt) {
    return;
  }
  if (investment.payoutReason === "boost") {
    return;
  }
  if (
    investment.referralBoostLink?.cancelledAt ||
    investment.referralBoostLink?.completedAt
  ) {
    return;
  }

  await cancelBoostPath(investmentId, reason);
}
