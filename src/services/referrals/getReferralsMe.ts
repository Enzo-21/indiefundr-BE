import {
  ReferralInviteStatus,
  ReferralRewardRole,
  ReferralRewardStatus,
  type ReferralInvite,
  type ReferralReward,
} from "@prisma/client";
import { REFERRAL_INVITER_BONUS_USDT } from "@/lib/config/referralRecovery";
import { prisma } from "@/lib/prisma";
import { buildShareUrl, getOrCreateReferralCode } from "./referralCode";
import {
  canEarnInviterRewards,
  hasCompletedFirstInvestment,
  maskEmail,
} from "./referralEligibility";
import { getRecoveryContextForInviter } from "./recoveryEligibility";
import {
  backfillInviterInvitesFromPendingCodes,
  ensureReferralPendingActivity,
  ensureSignedUpInviteAndInviterPending,
} from "./pendingReferralCode";
import { ensureInviterReferralPendingActivity } from "./referralWalletActivity";
import { getUserReferralSlot } from "./userReferralSlot";

export type ReferralInviteBonusStatus =
  | "awaiting_investment"
  | "pending"
  | "credited"
  | "none";

function mapInviteBonus(
  row: ReferralInvite & {
    invitee: { email: string } | null;
    rewards: ReferralReward[];
  }
) {
  const bonusUsdt = REFERRAL_INVITER_BONUS_USDT();
  const inviterReward = row.rewards.find(
    (reward) => reward.role === ReferralRewardRole.inviter_bonus
  );

  let bonusStatus: ReferralInviteBonusStatus = "none";
  let bonusLabel = "Recorded only";

  if (row.status === ReferralInviteStatus.signed_up) {
    bonusStatus = "awaiting_investment";
    bonusLabel = "Waiting for friend to invest";
  } else if (row.status === ReferralInviteStatus.qualified) {
    if (inviterReward?.status === ReferralRewardStatus.credited) {
      bonusStatus = "credited";
      bonusLabel = "Invested";
    } else {
      bonusStatus = "pending";
      bonusLabel = "Invested";
    }
  } else if (row.status === ReferralInviteStatus.attributed_late) {
    bonusStatus = "none";
    bonusLabel = "Recorded only";
  }

  return {
    id: row.id,
    status: row.status,
    signedUpAt: row.createdAt.toISOString(),
    qualifiedAt: row.qualifiedAt?.toISOString() ?? null,
    inviteeMasked: row.invitee ? maskEmail(row.invitee.email) : null,
    bonusUsdt,
    bonusStatus,
    bonusLabel,
  };
}

async function loadReferralRewardTotals(userId: string) {
  const inviterBonusUsdt = REFERRAL_INVITER_BONUS_USDT();
  const [rewardTotals, pendingRewards, awaitingInvestmentCount] = await Promise.all([
    prisma.referralReward.aggregate({
      where: {
        referralInvite: { inviterUserId: userId },
        role: { in: ["inviter_bonus", "principal_recovery"] },
        status: "credited",
      },
      _sum: { amountUsdt: true },
    }),
    prisma.referralReward.aggregate({
      where: {
        referralInvite: { inviterUserId: userId },
        status: "pending",
      },
      _sum: { amountUsdt: true },
    }),
    prisma.referralInvite.count({
      where: {
        inviterUserId: userId,
        status: ReferralInviteStatus.signed_up,
      },
    }),
  ]);

  const pendingFromRewards = pendingRewards._sum.amountUsdt ?? 0;
  const pendingFromAwaitingFriends = awaitingInvestmentCount * inviterBonusUsdt;

  return {
    earnedUsdt: rewardTotals._sum.amountUsdt ?? 0,
    pendingUsdt: pendingFromRewards + pendingFromAwaitingFriends,
  };
}

export async function getReferralCode(userId: string) {
  const ownCode = await getOrCreateReferralCode(userId);
  return {
    code: ownCode.code,
    shareUrl: buildShareUrl(ownCode.code),
  };
}

export async function getReferralInviterStats(userId: string) {
  await backfillInviterInvitesFromPendingCodes(userId);

  const [canEarn, recoveryCtx, inviteCount, totals] = await Promise.all([
    canEarnInviterRewards(userId),
    getRecoveryContextForInviter(userId),
    prisma.referralInvite.count({ where: { inviterUserId: userId } }),
    loadReferralRewardTotals(userId),
  ]);

  return {
    inviteCount,
    totals,
    canEarnInviterRewards: canEarn,
    mode: recoveryCtx.mode,
    recovery: recoveryCtx.recovery,
  };
}

export async function getReferralShareSummary(userId: string) {
  const share = await getReferralCode(userId);
  return { share };
}

export async function getReferralRedemption(userId: string) {
  const [slot, hasInvested] = await Promise.all([
    getUserReferralSlot(userId),
    hasCompletedFirstInvestment(userId),
  ]);

  const hasRedeemed = Boolean(slot?.referredByInviteId);
  const pendingCode = slot?.pendingReferralCode?.code ?? null;
  const canRedeem = !hasRedeemed && !pendingCode && !hasInvested;
  const canRedeemReason = hasRedeemed
    ? "ALREADY_REDEEMED"
    : hasInvested
      ? "NOT_ELIGIBLE_TO_REDEEM"
      : null;

  if (pendingCode && slot?.pendingReferralCode) {
    const existingPendingActivity = await prisma.walletActivity.findFirst({
      where: {
        userId,
        kind: "referral_bonus_pending",
        entityId: `referral-pending:${userId}`,
      },
      select: { id: true },
    });
    if (!existingPendingActivity) {
      await ensureReferralPendingActivity(userId, pendingCode);
    }

    const invitee = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (invitee?.email) {
      await ensureSignedUpInviteAndInviterPending(
        userId,
        invitee.email,
        slot.pendingReferralCode
      );
    }
  }

  return {
    canRedeem,
    canRedeemReason,
    hasRedeemed,
    pendingCode,
    pendingInviterMasked: slot?.pendingReferralCode
      ? maskEmail(slot.pendingReferralCode.owner.email)
      : null,
    code: slot?.referredByInvite?.referralCode.code ?? null,
    inviterMasked: slot?.referredByInvite
      ? maskEmail(slot.referredByInvite.inviter.email)
      : null,
    redeemedAt: slot?.referredByInvite?.redeemedAt?.toISOString() ?? null,
    status: slot?.referredByInvite?.status ?? null,
  };
}

export async function getReferralsMe(userId: string) {
  const [share, inviterStats, redemption, invites] = await Promise.all([
    getReferralCode(userId),
    getReferralInviterStats(userId),
    getReferralRedemption(userId),
    prisma.referralInvite.findMany({
      where: { inviterUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        invitee: { select: { email: true } },
        rewards: {
          where: { role: ReferralRewardRole.inviter_bonus },
          take: 1,
        },
      },
    }),
  ]);

  for (const invite of invites) {
    if (invite.status !== ReferralInviteStatus.signed_up || !invite.invitee?.email) {
      continue;
    }
    const entityId = `referral-inviter-pending:${invite.id}`;
    const existingInviterPending = await prisma.walletActivity.findFirst({
      where: {
        userId,
        kind: "referral_bonus_pending",
        entityId,
      },
      select: { id: true },
    });
    if (!existingInviterPending) {
      await ensureInviterReferralPendingActivity(
        userId,
        invite.id,
        maskEmail(invite.invitee.email)
      );
    }
  }

  return {
    share: {
      ...share,
      canEarnInviterRewards: inviterStats.canEarnInviterRewards,
    },
    redemption,
    mode: inviterStats.mode,
    recovery: inviterStats.recovery,
    inviteCount: inviterStats.inviteCount,
    invites: invites.map((row) => mapInviteBonus(row)),
    totals: inviterStats.totals,
  };
}

export async function getPendingReferralRewards(userId: string) {
  const activities = await prisma.walletActivity.findMany({
    where: {
      userId,
      kind: {
        in: [
          "referral_bonus_pending",
          "referral_bonus_processing",
          "referral_bonus_credited",
        ],
      },
    },
    orderBy: { occurredAt: "desc" },
    take: 20,
  });

  return activities.map((row) => ({
    id: row.id,
    kind: row.kind,
    amountUsdt: row.amountUsdt,
    label: row.label,
    status: row.status,
    occurredAt: row.occurredAt.toISOString(),
  }));
}

export async function dismissSympathyModal(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { sympathyModalDismissedAt: new Date() },
  });
}

export async function shouldShowRecoveryModal(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sympathyModalDismissedAt: true },
  });
  if (!user) return false;

  const { getPendingUnpaidMaturityChoiceForUser } = await import(
    "@/services/investments/unpaidMaturityChoice"
  );
  const pendingChoice = await getPendingUnpaidMaturityChoiceForUser(userId);
  if (pendingChoice) return false;

  const ctx = await getRecoveryContextForInviter(userId);
  if (ctx.mode !== "recovery") return false;

  if (!user.sympathyModalDismissedAt) return true;

  const { SYMPATHY_MODAL_COOLDOWN_DAYS } = await import("@/lib/config/referralRecovery");
  const cooldownMs = SYMPATHY_MODAL_COOLDOWN_DAYS() * 24 * 60 * 60 * 1000;
  return Date.now() - user.sympathyModalDismissedAt.getTime() > cooldownMs;
}
