import { ReferralInviteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFirstCompletedInvestment } from "./referralEligibility";
import { onReferralQualified } from "./referralRewardEngine";

export async function applyPendingReferralCode(
  userId: string,
  investmentId: string
): Promise<void> {
  const isFirst = await isFirstCompletedInvestment(userId, investmentId);
  if (!isFirst) return;

  const existingInvite = await prisma.referralInvite.findUnique({
    where: { inviteeUserId: userId },
  });

  if (existingInvite) {
    if (existingInvite.status !== ReferralInviteStatus.signed_up) {
      return;
    }
    await prisma.user.update({
      where: { id: userId },
      data: {
        referredByInviteId: existingInvite.id,
        pendingReferralCodeId: null,
      },
    });
    await onReferralQualified(existingInvite.id, investmentId);
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pendingReferralCodeId: true, referredByInviteId: true },
  });
  if (!user?.pendingReferralCodeId || user.referredByInviteId) return;

  const referralCode = await prisma.referralCode.findUnique({
    where: { id: user.pendingReferralCodeId },
  });
  if (!referralCode) return;

  const invite = await prisma.$transaction(async (tx) => {
    const created = await tx.referralInvite.create({
      data: {
        inviterUserId: referralCode.userId,
        inviteeUserId: userId,
        referralCodeId: referralCode.id,
        status: ReferralInviteStatus.signed_up,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        referredByInviteId: created.id,
        pendingReferralCodeId: null,
      },
    });

    return created;
  });

  await onReferralQualified(invite.id, investmentId);
}
