import {
  ReferralInviteStatus,
  ReferralPayoutOrderKind,
} from "@prisma/client";
import {
  REFERRAL_INVITEE_BONUS_USDT,
  REFERRAL_INVITER_BONUS_USDT,
  REFERRAL_RECOVERY_INVITEES_REQUIRED,
  REFERRAL_RECOVERY_PRINCIPAL_USDT,
} from "@/lib/config/referralRecovery";
import { prisma } from "@/lib/prisma";
import { getRecoveryContextForInviter } from "./recoveryEligibility";
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
import {
  clearInviterReferralPendingActivity,
  clearReferralPendingActivity,
} from "./referralWalletActivity";

export function shouldUseRecoverySlot(
  link: { completedAt: Date | null; inviteIds: string[] } | null,
  inviteId: string,
  required: number = REFERRAL_RECOVERY_INVITEES_REQUIRED()
): boolean {
  const recoveryComplete = Boolean(link?.completedAt);
  const slotsFull = (link?.inviteIds.length ?? 0) >= required;
  const alreadyCounted = link?.inviteIds.includes(inviteId) ?? false;
  return !recoveryComplete && !slotsFull && !alreadyCounted;
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

  return { link, investmentId };
}

async function maybeEnqueuePrincipalRecoveryOrder(
  inviterUserId: string,
  inviteId: string
) {
  const tracked = await trackRecoveryInvite(inviterUserId, inviteId);
  if (!tracked) return;

  const { link, investmentId } = tracked;
  if (link.inviteIds.length < REFERRAL_RECOVERY_INVITEES_REQUIRED()) return;
  if (link.completedAt) return;

  const principal = REFERRAL_RECOVERY_PRINCIPAL_USDT();
  await enqueueReferralPayoutOrder({
    userId: inviterUserId,
    referralInviteId: inviteId,
    kind: ReferralPayoutOrderKind.principal_recovery,
    amountUsdt: principal,
    investmentId,
  });
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

  await clearReferralPendingActivity(invite.inviteeUserId);
  await clearInviterReferralPendingActivity(invite.id);

  const recoveryCtx = await getRecoveryContextForInviter(invite.inviterUserId);
  if (recoveryCtx.mode === "recovery" && recoveryCtx.recovery) {
    const investmentIdForRecovery = recoveryCtx.recovery.investmentId;
    const required = REFERRAL_RECOVERY_INVITEES_REQUIRED();
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
