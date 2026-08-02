import {
  ReferralInviteStatus,
  ReferralPayoutOrderKind,
} from "@prisma/client";
import {
  getRecoveryInviteesRequired,
  REFERRAL_INVITEE_BONUS_USDT,
  REFERRAL_INVITER_BONUS_USDT,
} from "@/lib/config/referralRecovery";
import { getBoostInviteesRequired } from "@/lib/config/referralBoost";
import { prisma } from "@/lib/prisma";
import { getRecoveryContextForInviter } from "./recoveryEligibility";
import { getBoostContextForInviter } from "./boostEligibility";
import { completeBoostUnlock } from "./boostLifecycle";
import {
  hasCompletedFirstInvestment,
  isFirstCompletedInvestment,
} from "./referralEligibility";
import {
  bothPartiesHaveInvested,
  findDeferredQualifiedInvites,
  hasIssuedInviteeBonus,
} from "./referralPayoutEligibility";
import { enqueueReferralPayoutOrder } from "./referralPayoutOrderQueue";
import { scheduleUserLevelRecalculation } from "@/services/playerLevels/scheduleUserLevelRecalculation";

export function shouldUseRecoverySlot(
  link: { completedAt: Date | null; inviteIds: string[] } | null,
  inviteId: string,
  required: number
): boolean {
  const recoveryComplete = Boolean(link?.completedAt);
  const slotsFull = (link?.inviteIds.length ?? 0) >= required;
  const alreadyCounted = link?.inviteIds.includes(inviteId) ?? false;
  return !recoveryComplete && !slotsFull && !alreadyCounted;
}

export function shouldUseBoostSlot(
  link: {
    completedAt: Date | null;
    cancelledAt: Date | null;
    inviteIds: string[];
  } | null,
  inviteId: string,
  required: number
): boolean {
  if (!link) return true;
  if (link.completedAt || link.cancelledAt) return false;
  const slotsFull = link.inviteIds.length >= required;
  const alreadyCounted = link.inviteIds.includes(inviteId);
  return !slotsFull && !alreadyCounted;
}

async function trackRecoveryInvite(inviterUserId: string, inviteId: string) {
  const ctx = await getRecoveryContextForInviter(inviterUserId);
  if (ctx.mode !== "recovery" || !ctx.recovery) return null;

  const investmentId = ctx.recovery.investmentId;
  let link = await prisma.referralRecoveryLink.findUnique({
    where: { investmentId },
  });

  if (!link) {
    link = await prisma.referralRecoveryLink.create({
      data: {
        investmentId,
        inviterUserId,
        inviteIds: [inviteId],
      },
    });
  } else if (!link.inviteIds.includes(inviteId)) {
    link = await prisma.referralRecoveryLink.update({
      where: { id: link.id },
      data: { inviteIds: { push: inviteId } },
    });
  }

  return { link, investmentId, principalUsdt: ctx.recovery.principalUsdt };
}

async function maybeEnqueuePrincipalRecoveryOrder(
  inviterUserId: string,
  inviteId: string
) {
  const tracked = await trackRecoveryInvite(inviterUserId, inviteId);
  if (!tracked) return;

  const { link, investmentId, principalUsdt } = tracked;
  const required = getRecoveryInviteesRequired(principalUsdt);
  if (link.inviteIds.length < required) return;
  if (link.completedAt) return;

  await enqueueReferralPayoutOrder({
    userId: inviterUserId,
    referralInviteId: inviteId,
    kind: ReferralPayoutOrderKind.principal_recovery,
    amountUsdt: principalUsdt,
    investmentId,
  });
}

async function trackBoostInvite(
  inviterUserId: string,
  inviteId: string,
  inviteeInvestmentId: string
) {
  const ctx = await getBoostContextForInviter(inviterUserId);
  if (ctx.mode !== "boost" || !ctx.boost) return null;

  const investmentId = ctx.boost.investmentId;
  let link = await prisma.referralBoostLink.findUnique({
    where: { investmentId },
  });

  if (!link) {
    link = await prisma.referralBoostLink.create({
      data: {
        investmentId,
        inviterUserId,
        inviteIds: [inviteId],
        inviteeInvestmentIds: [inviteeInvestmentId],
      },
    });
  } else if (!link.inviteIds.includes(inviteId)) {
    link = await prisma.referralBoostLink.update({
      where: { id: link.id },
      data: {
        inviteIds: { push: inviteId },
        inviteeInvestmentIds: { push: inviteeInvestmentId },
      },
    });
  }

  return {
    link,
    investmentId,
    principalUsdt: ctx.boost.principalUsdt,
  };
}

async function maybeCompleteBoostUnlock(
  inviterUserId: string,
  inviteId: string,
  inviteeInvestmentId: string
) {
  const tracked = await trackBoostInvite(
    inviterUserId,
    inviteId,
    inviteeInvestmentId
  );
  if (!tracked) return;

  const { link, investmentId, principalUsdt } = tracked;
  const required = getBoostInviteesRequired(principalUsdt);
  if (link.inviteIds.length < required) return;
  if (link.completedAt || link.cancelledAt) return;

  const inviteeInvestments = await prisma.investment.findMany({
    where: { id: { in: link.inviteeInvestmentIds } },
    select: { id: true, userId: true },
  });

  await completeBoostUnlock(
    investmentId,
    inviteeInvestments.map((row) => row.id),
    [...new Set(inviteeInvestments.map((row) => row.userId))]
  );
}

export async function issueReferralRewards(
  referralInviteId: string,
  investmentId: string
) {
  const invite = await prisma.referralInvite.findUnique({
    where: { id: referralInviteId },
  });
  if (!invite) return;
  if (invite.status === ReferralInviteStatus.attributed_late) return;

  if (await hasIssuedInviteeBonus(referralInviteId)) {
    return;
  }

  const ready = await bothPartiesHaveInvested(
    invite.inviterUserId,
    invite.inviteeUserId
  );
  if (!ready) {
    return;
  }

  const inviteeBonus = REFERRAL_INVITEE_BONUS_USDT();
  const inviterBonus = REFERRAL_INVITER_BONUS_USDT();

  await enqueueReferralPayoutOrder({
    userId: invite.inviteeUserId,
    referralInviteId,
    kind: ReferralPayoutOrderKind.invitee_bonus,
    amountUsdt: inviteeBonus,
    investmentId,
  });

  const recoveryCtx = await getRecoveryContextForInviter(invite.inviterUserId);
  if (recoveryCtx.mode === "recovery" && recoveryCtx.recovery) {
    const investmentIdForRecovery = recoveryCtx.recovery.investmentId;
    const required = getRecoveryInviteesRequired(
      recoveryCtx.recovery.principalUsdt
    );
    const link = await prisma.referralRecoveryLink.findUnique({
      where: { investmentId: investmentIdForRecovery },
    });

    if (shouldUseRecoverySlot(link, referralInviteId, required)) {
      await prisma.investment.update({
        where: { id: investmentId },
        data: { excludedFromTriadUnlock: true },
      });
      await maybeEnqueuePrincipalRecoveryOrder(
        invite.inviterUserId,
        referralInviteId
      );
      scheduleUserLevelRecalculation(invite.inviterUserId);
      return;
    }
  }

  const boostCtx = await getBoostContextForInviter(invite.inviterUserId);
  if (boostCtx.mode === "boost" && boostCtx.boost) {
    const investmentIdForBoost = boostCtx.boost.investmentId;
    const required = getBoostInviteesRequired(boostCtx.boost.principalUsdt);
    const link = await prisma.referralBoostLink.findUnique({
      where: { investmentId: investmentIdForBoost },
    });

    if (shouldUseBoostSlot(link, referralInviteId, required)) {
      await prisma.investment.update({
        where: { id: investmentId },
        data: { excludedFromTriadUnlock: true },
      });
      await maybeCompleteBoostUnlock(
        invite.inviterUserId,
        referralInviteId,
        investmentId
      );
      scheduleUserLevelRecalculation(invite.inviterUserId);
      return;
    }
  }

  await enqueueReferralPayoutOrder({
    userId: invite.inviterUserId,
    referralInviteId,
    kind: ReferralPayoutOrderKind.inviter_bonus,
    amountUsdt: inviterBonus,
    investmentId,
  });
  scheduleUserLevelRecalculation(invite.inviterUserId);
}

export async function onReferralQualified(
  referralInviteId: string,
  investmentId: string
) {
  const invite = await prisma.referralInvite.findUnique({
    where: { id: referralInviteId },
  });
  if (!invite) return;
  if (invite.status === ReferralInviteStatus.attributed_late) return;

  if (invite.status !== ReferralInviteStatus.qualified) {
    await prisma.referralInvite.update({
      where: { id: referralInviteId },
      data: {
        status: ReferralInviteStatus.qualified,
        qualifiedAt: new Date(),
      },
    });
    scheduleUserLevelRecalculation(invite.inviterUserId);
  }

  if (await hasIssuedInviteeBonus(referralInviteId)) {
    return;
  }

  const ready = await bothPartiesHaveInvested(
    invite.inviterUserId,
    invite.inviteeUserId
  );
  if (!ready) {
    return;
  }

  await issueReferralRewards(referralInviteId, investmentId);
}

export async function releaseDeferredReferralRewardsOnInviterFirstInvestment(
  inviterUserId: string,
  investmentId: string
): Promise<void> {
  const isFirst = await isFirstCompletedInvestment(inviterUserId, investmentId);
  if (!isFirst) {
    return;
  }

  const invites = await findDeferredQualifiedInvites(inviterUserId);

  for (const invite of invites) {
    const alreadyIssued = await hasIssuedInviteeBonus(invite.id);
    if (alreadyIssued) {
      continue;
    }

    const inviteeInvested = await hasCompletedFirstInvestment(invite.inviteeUserId);
    if (!inviteeInvested) {
      continue;
    }

    await issueReferralRewards(invite.id, investmentId);
  }
}
