import {
  ReferralPayoutOrderKind,
  ReferralPayoutOrderStatus,
  ReferralRewardRole,
  ReferralRewardStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMainWallet } from "@/lib/wallets/helpers";
import {
  markInviterReferralProcessingActivity,
  markInviteeReferralProcessingActivity,
} from "./referralWalletActivity";

function rewardRoleForKind(kind: ReferralPayoutOrderKind): ReferralRewardRole {
  switch (kind) {
    case ReferralPayoutOrderKind.invitee_bonus:
      return ReferralRewardRole.invitee_bonus;
    case ReferralPayoutOrderKind.inviter_bonus:
      return ReferralRewardRole.inviter_bonus;
    case ReferralPayoutOrderKind.principal_recovery:
      return ReferralRewardRole.principal_recovery;
  }
}

function kindLabel(kind: ReferralPayoutOrderKind): string {
  switch (kind) {
    case ReferralPayoutOrderKind.invitee_bonus:
      return "Invitee bonus";
    case ReferralPayoutOrderKind.inviter_bonus:
      return "Inviter bonus";
    case ReferralPayoutOrderKind.principal_recovery:
      return "Principal recovery";
  }
}

export { kindLabel as referralPayoutOrderKindLabel };

async function findExistingOrder(params: {
  referralInviteId?: string;
  investmentId?: string;
  kind: ReferralPayoutOrderKind;
}) {
  if (
    params.kind === ReferralPayoutOrderKind.principal_recovery &&
    params.investmentId
  ) {
    return prisma.referralPayoutOrder.findFirst({
      where: {
        investmentId: params.investmentId,
        kind: ReferralPayoutOrderKind.principal_recovery,
        status: { not: ReferralPayoutOrderStatus.failed },
      },
    });
  }

  if (!params.referralInviteId) {
    return null;
  }

  return prisma.referralPayoutOrder.findFirst({
    where: {
      referralInviteId: params.referralInviteId,
      kind: params.kind,
      status: { not: ReferralPayoutOrderStatus.failed },
    },
  });
}

export async function enqueueReferralPayoutOrder(params: {
  userId: string;
  referralInviteId: string;
  kind: ReferralPayoutOrderKind;
  amountUsdt: number;
  investmentId?: string;
}) {
  const existing = await findExistingOrder({
    referralInviteId: params.referralInviteId,
    investmentId: params.investmentId,
    kind: params.kind,
  });
  if (existing) {
    return existing;
  }

  const wallet = await getMainWallet(params.userId);
  if (!wallet) {
    throw new Error("Wallet not found for referral payout order");
  }

  const role = rewardRoleForKind(params.kind);
  const order = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.referralPayoutOrder.create({
      data: {
        userId: params.userId,
        walletId: wallet.id,
        referralInviteId: params.referralInviteId,
        investmentId: params.investmentId,
        kind: params.kind,
        amountUsdt: params.amountUsdt,
        status: ReferralPayoutOrderStatus.queued,
      },
    });

    await tx.referralReward.create({
      data: {
        referralInviteId: params.referralInviteId,
        role,
        amountUsdt: params.amountUsdt,
        status: ReferralRewardStatus.pending,
        investmentId: params.investmentId,
        referralPayoutOrderId: createdOrder.id,
      },
    });

    return createdOrder;
  });

  if (params.kind === ReferralPayoutOrderKind.invitee_bonus) {
    await markInviteeReferralProcessingActivity(params.userId, wallet.id);
  } else if (params.kind === ReferralPayoutOrderKind.inviter_bonus) {
    await markInviterReferralProcessingActivity(
      params.userId,
      wallet.id,
      params.referralInviteId
    );
  } else {
    await markInviterReferralProcessingActivity(
      params.userId,
      wallet.id,
      `principal-${params.investmentId ?? params.referralInviteId}`
    );
  }

  return order;
}
