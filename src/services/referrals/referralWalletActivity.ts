import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMainWallet } from "@/lib/wallets/helpers";
import {
  REFERRAL_INVITEE_BONUS_USDT,
  REFERRAL_INVITER_BONUS_USDT,
  REFERRAL_RECOVERY_PRINCIPAL_USDT,
} from "@/lib/config/referralRecovery";

const PENDING_ENTITY_PREFIX = "referral-pending:";
const INVITER_PENDING_ENTITY_PREFIX = "referral-inviter-pending:";

export const REFERRAL_WALLET_ACTIVITY_KINDS = [
  "referral_bonus_pending",
  "referral_bonus_processing",
  "referral_bonus_credited",
  "referral_principal_recovery",
] as const;

type WalletActivityDb = Prisma.TransactionClient | typeof prisma;

function buildReferralPendingTapInfo(amount: number) {
  const formatted = amount.toFixed(2);
  return {
    title: "Referral bonus pending",
    message:
      `You've earned ${formatted} USDT from your friend's code. ` +
      "This bonus will be added to your balance after you complete your first investment.",
  };
}

function buildInviterReferralPendingTapInfo(amount: number) {
  const formatted = amount.toFixed(2);
  return {
    title: "Referral reward pending",
    message:
      `You've earned ${formatted} USDT for inviting a friend. ` +
      "This reward will be added to your balance after they complete their first investment.",
  };
}

async function upsertWalletActivityByEntity(
  params: {
    userId: string;
    walletId: string;
    kind: string;
    entityId: string;
    data: {
      type: string;
      amountUsdt: number;
      status: string;
      label: string;
      detail?: string | null;
      pendingTapInfo?: { title: string; message: string };
      occurredAt: Date;
      chainFinal: boolean;
    };
  },
  db: WalletActivityDb = prisma
) {
  const existing = await db.walletActivity.findFirst({
    where: {
      userId: params.userId,
      walletId: params.walletId,
      kind: params.kind,
      entityId: params.entityId,
    },
    select: { id: true },
  });

  if (existing) {
    await db.walletActivity.update({
      where: { id: existing.id },
      data: {
        ...params.data,
        pendingTapInfo: params.data.pendingTapInfo,
        updatedAt: new Date(),
      },
    });
    return;
  }

  await db.walletActivity.create({
    data: {
      userId: params.userId,
      walletId: params.walletId,
      kind: params.kind,
      entityId: params.entityId,
      ...params.data,
    },
  });
}

export async function upsertReferralPendingActivity(
  userId: string,
  walletId: string,
  code: string,
  db?: Prisma.TransactionClient
) {
  const entityId = `${PENDING_ENTITY_PREFIX}${userId}`;
  const amount = REFERRAL_INVITEE_BONUS_USDT();
  const now = new Date();
  const pendingTapInfo = buildReferralPendingTapInfo(amount);

  await upsertWalletActivityByEntity(
    {
      userId,
      walletId,
      kind: "referral_bonus_pending",
      entityId,
      data: {
        type: "in",
        amountUsdt: amount,
        status: "pending",
        label: "Referral bonus",
        detail: code,
        pendingTapInfo,
        occurredAt: now,
        chainFinal: true,
      },
    },
    db ?? prisma
  );
}

export async function clearReferralPendingActivity(userId: string) {
  const entityId = `${PENDING_ENTITY_PREFIX}${userId}`;
  await prisma.walletActivity.deleteMany({
    where: {
      userId,
      kind: "referral_bonus_pending",
      entityId,
    },
  });
}

export async function upsertInviterReferralPendingActivity(
  params: {
    inviterUserId: string;
    walletId: string;
    inviteId: string;
    inviteeMasked: string;
  },
  db?: Prisma.TransactionClient
) {
  const entityId = `${INVITER_PENDING_ENTITY_PREFIX}${params.inviteId}`;
  const amount = REFERRAL_INVITER_BONUS_USDT();
  const now = new Date();
  const pendingTapInfo = buildInviterReferralPendingTapInfo(amount);

  await upsertWalletActivityByEntity(
    {
      userId: params.inviterUserId,
      walletId: params.walletId,
      kind: "referral_bonus_pending",
      entityId,
      data: {
        type: "in",
        amountUsdt: amount,
        status: "pending",
        label: "Referral reward",
        detail: params.inviteeMasked,
        pendingTapInfo,
        occurredAt: now,
        chainFinal: true,
      },
    },
    db ?? prisma
  );
}

export async function ensureInviterReferralPendingActivity(
  inviterUserId: string,
  inviteId: string,
  inviteeMasked: string,
  db?: Prisma.TransactionClient
): Promise<void> {
  const wallet = await getMainWallet(inviterUserId).catch(() => null);
  if (!wallet) {
    return;
  }
  await upsertInviterReferralPendingActivity(
    {
      inviterUserId,
      walletId: wallet.id,
      inviteId,
      inviteeMasked,
    },
    db
  );
}

export async function clearInviterReferralPendingActivity(inviteId: string) {
  const entityId = `${INVITER_PENDING_ENTITY_PREFIX}${inviteId}`;
  await prisma.walletActivity.deleteMany({
    where: {
      kind: "referral_bonus_pending",
      entityId,
    },
  });
}

function buildReferralProcessingTapInfo(amount: number) {
  const formatted = amount.toFixed(2);
  return {
    title: "Referral payout queued",
    message:
      `${formatted} USDT is queued for treasury payout. ` +
      "It will appear in your wallet after the transfer completes.",
  };
}

export async function markInviteeReferralProcessingActivity(
  userId: string,
  walletId: string
) {
  const entityId = `${PENDING_ENTITY_PREFIX}${userId}`;
  const amount = REFERRAL_INVITEE_BONUS_USDT();
  await upsertWalletActivityByEntity({
    userId,
    walletId,
    kind: "referral_bonus_processing",
    entityId,
    data: {
      type: "in",
      amountUsdt: amount,
      status: "processing",
      label: "Referral bonus",
      detail: "Payout queued",
      pendingTapInfo: buildReferralProcessingTapInfo(amount),
      occurredAt: new Date(),
      chainFinal: false,
    },
  });
}

export async function markInviterReferralProcessingActivity(
  userId: string,
  walletId: string,
  inviteKey: string
) {
  const entityId = inviteKey.startsWith(INVITER_PENDING_ENTITY_PREFIX)
    ? inviteKey
    : inviteKey.startsWith("principal-")
      ? `referral-principal-processing:${inviteKey}`
      : `${INVITER_PENDING_ENTITY_PREFIX}${inviteKey}`;
  const amount = inviteKey.startsWith("principal-")
    ? REFERRAL_RECOVERY_PRINCIPAL_USDT()
    : REFERRAL_INVITER_BONUS_USDT();

  await upsertWalletActivityByEntity({
    userId,
    walletId,
    kind: "referral_bonus_processing",
    entityId,
    data: {
      type: "in",
      amountUsdt: amount,
      status: "processing",
      label: inviteKey.startsWith("principal-")
        ? "Principal recovery"
        : "Referral reward",
      detail: "Payout queued",
      pendingTapInfo: buildReferralProcessingTapInfo(amount),
      occurredAt: new Date(),
      chainFinal: false,
    },
  });
}

export async function createReferralBonusActivity(params: {
  userId: string;
  walletId: string;
  rewardId: string;
  amountUsdt: number;
  label: string;
}) {
  const entityId = `referral-reward-${params.rewardId}`;

  await upsertWalletActivityByEntity({
    userId: params.userId,
    walletId: params.walletId,
    kind: "referral_bonus_credited",
    entityId,
    data: {
      type: "in",
      amountUsdt: params.amountUsdt,
      status: "confirmed",
      label: params.label,
      occurredAt: new Date(),
      chainFinal: true,
    },
  });
}
