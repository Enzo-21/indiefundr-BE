import {
  InvestmentStatus,
  Prisma,
  ReferralInviteStatus,
  ReferralRewardRole,
  ReferralRewardStatus,
  type Investment,
} from "@prisma/client";
import {
  REFERRAL_INVITEE_BONUS_USDT,
  REFERRAL_INVITER_BONUS_USDT,
  REFERRAL_RECOVERY_INVITEES_REQUIRED,
  REFERRAL_RECOVERY_PRINCIPAL_USDT,
} from "@/lib/config/referralRecovery";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getMainWallet } from "@/lib/wallets/helpers";
import {
  recordReferralBonusOutflow,
  recordReferralPrincipalRecovery,
} from "@/services/revenueEngine/ledger";
import * as tron from "@/services/tron/client";
import { getRecoveryContextForInviter } from "./recoveryEligibility";
import {
  hasCompletedFirstInvestment,
  isFirstCompletedInvestment,
} from "./referralEligibility";
import {
  bothPartiesHaveInvested,
  findDeferredQualifiedInvites,
  hasCreditedInviteeBonus,
} from "./referralPayoutEligibility";
import {
  clearInviterReferralPendingActivity,
  clearReferralPendingActivity,
  createReferralBonusActivity,
} from "./referralWalletActivity";

async function creditReferralReward(params: {
  referralInviteId: string;
  role: ReferralRewardRole;
  userId: string;
  amountUsdt: number;
  investmentId?: string;
}) {
  const wallet = await getMainWallet(params.userId);
  if (!wallet) {
    throw new Error("Wallet not found for referral reward");
  }

  try {
    await recordReferralBonusOutflow(params.amountUsdt, {
      role: params.role,
      referralInviteId: params.referralInviteId,
      userId: params.userId,
    });
  } catch (err) {
    const reward = await prisma.referralReward.create({
      data: {
        referralInviteId: params.referralInviteId,
        role: params.role,
        amountUsdt: params.amountUsdt,
        status: ReferralRewardStatus.pending,
        investmentId: params.investmentId,
      },
    });
    return reward;
  }

  const reward = await prisma.referralReward.create({
    data: {
      referralInviteId: params.referralInviteId,
      role: params.role,
      amountUsdt: params.amountUsdt,
      status: ReferralRewardStatus.credited,
      investmentId: params.investmentId,
      creditedAt: new Date(),
    },
  });

  const label =
    params.role === ReferralRewardRole.invitee_bonus
      ? "Referral bonus"
      : "Referral reward";

  await createReferralBonusActivity({
    userId: params.userId,
    walletId: wallet.id,
    rewardId: reward.id,
    amountUsdt: params.amountUsdt,
    label,
  });

  return reward;
}

async function maybeCompleteRecovery(inviterUserId: string, inviteId: string) {
  const ctx = await getRecoveryContextForInviter(inviterUserId);
  if (ctx.mode !== "recovery" || !ctx.recovery) return;

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

  if (link.inviteIds.length < REFERRAL_RECOVERY_INVITEES_REQUIRED()) return;
  if (link.completedAt) return;

  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
  });
  if (!investment) return;

  const principal = REFERRAL_RECOVERY_PRINCIPAL_USDT();
  const receiver = await getMainWallet(inviterUserId);
  const treasuryPk = getEnv().treasuryPrivateKey;
  if (!receiver || !treasuryPk) {
    console.error("[referral] Principal recovery skipped: wallet/treasury not configured");
    return;
  }

  await recordReferralPrincipalRecovery(principal, investmentId, {
    inviterUserId,
    referralRecoveryLinkId: link.id,
  });

  let redemptionTx: Prisma.InputJsonValue | undefined;
  try {
    const signed = await tron.transferUsdt({
      fromPrivateKey: treasuryPk,
      toAddress: receiver.address,
      amount: principal,
    });
    redemptionTx = signed as Prisma.InputJsonValue;
  } catch (err) {
    console.error("[referral] Principal on-chain transfer failed:", err);
  }

  await prisma.$transaction([
    prisma.investment.update({
      where: { id: investmentId },
      data: {
        status: InvestmentStatus.referral_recovered,
        referralRecoveryCompletedAt: new Date(),
        recoveryEligibleAt: null,
        redemptionTransaction: redemptionTx,
        redeemedAt: new Date(),
      },
    }),
    prisma.referralRecoveryLink.update({
      where: { id: link.id },
      data: { completedAt: new Date() },
    }),
    prisma.referralReward.create({
      data: {
        referralInviteId: inviteId,
        role: ReferralRewardRole.principal_recovery,
        amountUsdt: principal,
        status: ReferralRewardStatus.credited,
        investmentId,
        creditedAt: new Date(),
      },
    }),
  ]);

  const wallet = receiver;
  await createReferralBonusActivity({
    userId: inviterUserId,
    walletId: wallet.id,
    rewardId: `principal-${investmentId}`,
    amountUsdt: principal,
    label: "Principal recovered",
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

  if (await hasCreditedInviteeBonus(referralInviteId)) {
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

  await creditReferralReward({
    referralInviteId,
    role: ReferralRewardRole.invitee_bonus,
    userId: invite.inviteeUserId,
    amountUsdt: inviteeBonus,
    investmentId,
  });

  await clearReferralPendingActivity(invite.inviteeUserId);
  await clearInviterReferralPendingActivity(invite.id);

  const recoveryCtx = await getRecoveryContextForInviter(invite.inviterUserId);
  if (recoveryCtx.mode === "recovery") {
    await maybeCompleteRecovery(invite.inviterUserId, referralInviteId);
    return;
  }

  await creditReferralReward({
    referralInviteId,
    role: ReferralRewardRole.inviter_bonus,
    userId: invite.inviterUserId,
    amountUsdt: inviterBonus,
    investmentId,
  });
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
  }

  if (await hasCreditedInviteeBonus(referralInviteId)) {
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
    const alreadyCredited = await hasCreditedInviteeBonus(invite.id);
    if (alreadyCredited) {
      continue;
    }

    const inviteeInvested = await hasCompletedFirstInvestment(invite.inviteeUserId);
    if (!inviteeInvested) {
      continue;
    }

    await issueReferralRewards(invite.id, investmentId);
  }
}
