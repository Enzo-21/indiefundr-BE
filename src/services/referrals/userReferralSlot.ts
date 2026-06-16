import { prisma } from "@/lib/prisma";

export async function getUserReferralSlot(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      pendingReferralCodeId: true,
      referredByInviteId: true,
      pendingReferralCode: {
        select: {
          id: true,
          userId: true,
          code: true,
          owner: { select: { username: true } },
        },
      },
      referredByInvite: {
        select: {
          id: true,
          status: true,
          redeemedAt: true,
          referralCode: { select: { code: true } },
          inviter: { select: { username: true } },
        },
      },
    },
  });
}

export function hasUsedReferralSlot(user: {
  pendingReferralCodeId: string | null;
  referredByInviteId: string | null;
}): boolean {
  return Boolean(user.pendingReferralCodeId || user.referredByInviteId);
}
