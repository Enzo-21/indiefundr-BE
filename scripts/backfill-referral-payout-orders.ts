import "dotenv/config";
import {
  ReferralPayoutOrderKind,
  ReferralPayoutOrderStatus,
  ReferralRewardRole,
  ReferralRewardStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMainWallet } from "@/lib/wallets/helpers";

function kindForRole(role: ReferralRewardRole): ReferralPayoutOrderKind | null {
  switch (role) {
    case ReferralRewardRole.invitee_bonus:
      return ReferralPayoutOrderKind.invitee_bonus;
    case ReferralRewardRole.inviter_bonus:
      return ReferralPayoutOrderKind.inviter_bonus;
    case ReferralRewardRole.principal_recovery:
      return ReferralPayoutOrderKind.principal_recovery;
    default:
      return null;
  }
}

async function main() {
  const pendingRewards = await prisma.referralReward.findMany({
    where: {
      status: ReferralRewardStatus.pending,
      referralPayoutOrderId: null,
    },
    include: {
      referralInvite: {
        select: { inviterUserId: true, inviteeUserId: true },
      },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const reward of pendingRewards) {
    const kind = kindForRole(reward.role);
    if (!kind) {
      skipped++;
      continue;
    }

    const payeeUserId =
      kind === ReferralPayoutOrderKind.invitee_bonus
        ? reward.referralInvite.inviteeUserId
        : reward.referralInvite.inviterUserId;

    const wallet = await getMainWallet(payeeUserId);
    if (!wallet) {
      console.warn("[backfill] skipping reward without wallet", reward.id);
      skipped++;
      continue;
    }

    const existing = await prisma.referralPayoutOrder.findFirst({
      where: {
        referralInviteId: reward.referralInviteId,
        kind,
        status: { not: ReferralPayoutOrderStatus.failed },
      },
    });
    if (existing) {
      await prisma.referralReward.update({
        where: { id: reward.id },
        data: { referralPayoutOrderId: existing.id },
      });
      skipped++;
      continue;
    }

    const order = await prisma.referralPayoutOrder.create({
      data: {
        userId: payeeUserId,
        walletId: wallet.id,
        referralInviteId: reward.referralInviteId,
        investmentId: reward.investmentId,
        kind,
        amountUsdt: reward.amountUsdt,
        status: ReferralPayoutOrderStatus.queued,
      },
    });

    await prisma.referralReward.update({
      where: { id: reward.id },
      data: { referralPayoutOrderId: order.id },
    });

    created++;
  }

  console.log(
    `[backfill-referral-payout-orders] created=${created} skipped=${skipped}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
