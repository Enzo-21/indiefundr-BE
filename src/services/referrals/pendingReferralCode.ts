import { ReferralInviteStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMainWallet } from "@/lib/wallets/helpers";
import { findReferralCodeByCode } from "./referralCode";
import { ReferralError } from "./referralErrors";
import { hasCompletedFirstInvestment, maskEmail } from "./referralEligibility";
import { getUserReferralSlot, hasUsedReferralSlot } from "./userReferralSlot";
import { REFERRAL_INVITEE_BONUS_USDT } from "@/lib/config/referralRecovery";
import {
  ensureInviterReferralPendingActivity,
  upsertInviterReferralPendingActivity,
  upsertReferralPendingActivity,
} from "./referralWalletActivity";

export async function ensureReferralPendingActivity(
  userId: string,
  code: string
): Promise<void> {
  const wallet = await getMainWallet(userId).catch(() => null);
  if (!wallet) {
    return;
  }
  await upsertReferralPendingActivity(userId, wallet.id, code);
}

export async function ensureSignedUpInviteAndInviterPending(
  inviteeUserId: string,
  inviteeEmail: string,
  referralCode: { id: string; userId: string; code: string },
  db?: Prisma.TransactionClient
) {
  const client = db ?? prisma;
  let invite = await client.referralInvite.findUnique({
    where: { inviteeUserId },
  });

  if (!invite) {
    invite = await client.referralInvite.create({
      data: {
        inviterUserId: referralCode.userId,
        inviteeUserId,
        referralCodeId: referralCode.id,
        status: ReferralInviteStatus.signed_up,
      },
    });
  }

  const inviteeMasked = maskEmail(inviteeEmail);
  const inviterWallet = await getMainWallet(invite.inviterUserId).catch(() => null);
  if (inviterWallet) {
    if (db) {
      await upsertInviterReferralPendingActivity(
        {
          inviterUserId: invite.inviterUserId,
          walletId: inviterWallet.id,
          inviteId: invite.id,
          inviteeMasked,
        },
        db
      );
    } else {
      await ensureInviterReferralPendingActivity(
        invite.inviterUserId,
        invite.id,
        inviteeMasked
      );
    }
  }

  return invite;
}

export async function backfillInviterInvitesFromPendingCodes(
  inviterUserId: string
): Promise<number> {
  const pendingRedeemers = await prisma.user.findMany({
    where: {
      pendingReferralCode: { userId: inviterUserId },
    },
    select: {
      id: true,
      email: true,
      pendingReferralCode: { select: { id: true, userId: true, code: true } },
    },
  });

  let created = 0;
  for (const redeemer of pendingRedeemers) {
    if (!redeemer.email || !redeemer.pendingReferralCode) {
      continue;
    }
    const existing = await prisma.referralInvite.findUnique({
      where: { inviteeUserId: redeemer.id },
      select: { id: true },
    });
    if (existing) {
      continue;
    }
    await ensureSignedUpInviteAndInviterPending(
      redeemer.id,
      redeemer.email,
      redeemer.pendingReferralCode
    );
    created += 1;
  }
  return created;
}

function buildPendingSaveResponse(
  referralCode: { code: string; owner: { email: string } },
  bonusUsdt: number
) {
  return {
    mode: "pending" as const,
    bonusUsdt,
    pendingCode: referralCode.code,
    pendingInviterMasked: maskEmail(referralCode.owner.email),
    message: "Code saved — bonus unlocks when you invest",
  };
}

export async function savePendingReferralCode(userId: string, rawCode: string) {
  if (await hasCompletedFirstInvestment(userId)) {
    throw new ReferralError(
      "NOT_ELIGIBLE_TO_REDEEM",
      "Welcome bonuses are only for new users who have not invested yet",
      403
    );
  }

  const referralCode = await findReferralCodeByCode(rawCode);
  if (!referralCode) {
    throw new ReferralError("INVALID_CODE", "Referral code not found", 400);
  }
  if (referralCode.userId === userId) {
    throw new ReferralError("SELF_REFERRAL", "You cannot use your own code", 400);
  }

  const [user, invitee] = await Promise.all([
    getUserReferralSlot(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);

  if (!user || !invitee?.email) {
    throw new ReferralError("INVALID_CODE", "User not found", 400);
  }

  const bonusUsdt = REFERRAL_INVITEE_BONUS_USDT();

  const existingInvite = await prisma.referralInvite.findUnique({
    where: { inviteeUserId: userId },
    select: { id: true, referralCodeId: true },
  });

  if (
    existingInvite &&
    existingInvite.referralCodeId !== referralCode.id &&
    user.pendingReferralCodeId !== referralCode.id
  ) {
    throw new ReferralError(
      "ALREADY_REDEEMED",
      "You have already used a referral code",
      409
    );
  }

  if (user.pendingReferralCodeId === referralCode.id) {
    await ensureReferralPendingActivity(userId, referralCode.code);
    await ensureSignedUpInviteAndInviterPending(
      userId,
      invitee.email,
      referralCode
    );
    return buildPendingSaveResponse(referralCode, bonusUsdt);
  }

  if (hasUsedReferralSlot(user)) {
    throw new ReferralError(
      "ALREADY_REDEEMED",
      "You have already used a referral code",
      409
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { pendingReferralCodeId: referralCode.id },
    });

    const wallet = await getMainWallet(userId).catch(() => null);
    if (wallet) {
      await upsertReferralPendingActivity(
        userId,
        wallet.id,
        referralCode.code,
        tx
      );
    }

    await ensureSignedUpInviteAndInviterPending(
      userId,
      invitee.email,
      referralCode,
      tx
    );
  });

  return buildPendingSaveResponse(referralCode, bonusUsdt);
}
