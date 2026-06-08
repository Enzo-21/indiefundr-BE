import {
  ReferralInviteStatus,
  ReferralRewardRole,
  ReferralRewardStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasCompletedFirstInvestment } from "./referralEligibility";

export async function bothPartiesHaveInvested(
  inviterUserId: string,
  inviteeUserId: string
): Promise<boolean> {
  const [inviterInvested, inviteeInvested] = await Promise.all([
    hasCompletedFirstInvestment(inviterUserId),
    hasCompletedFirstInvestment(inviteeUserId),
  ]);
  return inviterInvested && inviteeInvested;
}

export async function hasCreditedInviteeBonus(
  referralInviteId: string
): Promise<boolean> {
  const reward = await prisma.referralReward.findFirst({
    where: {
      referralInviteId,
      role: ReferralRewardRole.invitee_bonus,
      status: ReferralRewardStatus.credited,
    },
    select: { id: true },
  });
  return Boolean(reward);
}

export async function findDeferredQualifiedInvites(inviterUserId: string) {
  return prisma.referralInvite.findMany({
    where: {
      inviterUserId,
      status: ReferralInviteStatus.qualified,
    },
    select: { id: true, inviteeUserId: true },
  });
}
