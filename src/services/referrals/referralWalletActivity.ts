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

const REFERRAL_LIFECYCLE_KINDS = [
  "referral_bonus_pending",
  "referral_bonus_processing",
  "referral_bonus_credited",
] as const;

type WalletActivityDb = Prisma.TransactionClient | typeof prisma;

export function inviteeReferralActivityEntityId(userId: string): string {
  return `${PENDING_ENTITY_PREFIX}${userId}`;
}

export function inviterReferralActivityEntityId(inviteId: string): string {
  return `${INVITER_PENDING_ENTITY_PREFIX}${inviteId}`;
}

const PRINCIPAL_RECOVERY_ENTITY_PREFIX =
  "referral-principal-processing:principal-";

export function principalRecoveryActivityEntityId(investmentId: string): string {
  return `${PRINCIPAL_RECOVERY_ENTITY_PREFIX}${investmentId}`;
}

export function parsePrincipalRecoveryInvestmentId(
  entityId: string
): string | null {
  if (!entityId.startsWith(PRINCIPAL_RECOVERY_ENTITY_PREFIX)) {
    return null;
  }
  const investmentId = entityId.slice(PRINCIPAL_RECOVERY_ENTITY_PREFIX.length);
  return investmentId.length > 0 ? investmentId : null;
}

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

function buildReferralProcessingTapInfo(amount: number) {
  const formatted = amount.toFixed(2);
  return {
    title: "Referral payout queued",
    message:
      `${formatted} USDT is queued for treasury payout. ` +
      "It will appear in your wallet after the transfer completes.",
  };
}

export async function findReferralActivityByEntityId(
  userId: string,
  walletId: string,
  entityId: string,
  db: WalletActivityDb = prisma
) {
  return db.walletActivity.findFirst({
    where: {
      userId,
      walletId,
      entityId,
      kind: { in: [...REFERRAL_LIFECYCLE_KINDS] },
    },
  });
}

type ReferralActivityTransitionData = {
  type: string;
  amountUsdt: number;
  status: string;
  label: string;
  detail?: string | null;
  pendingTapInfo?: { title: string; message: string } | null;
  occurredAt?: Date;
  chainFinal: boolean;
  txId?: string | null;
  tronscanUrl?: string | null;
};

export async function transitionReferralActivity(
  params: {
    userId: string;
    walletId: string;
    entityId: string;
    nextKind: (typeof REFERRAL_LIFECYCLE_KINDS)[number];
    data: ReferralActivityTransitionData;
  },
  db: WalletActivityDb = prisma
): Promise<string> {
  const occurredAt = params.data.occurredAt ?? new Date();
  const existing = await findReferralActivityByEntityId(
    params.userId,
    params.walletId,
    params.entityId,
    db
  );

  const updateData = {
    kind: params.nextKind,
    type: params.data.type,
    amountUsdt: params.data.amountUsdt,
    status: params.data.status,
    label: params.data.label,
    detail: params.data.detail ?? null,
    occurredAt,
    chainFinal: params.data.chainFinal,
    txId: params.data.txId ?? null,
    tronscanUrl: params.data.tronscanUrl ?? null,
    updatedAt: new Date(),
    ...(params.data.pendingTapInfo === undefined
      ? {}
      : { pendingTapInfo: params.data.pendingTapInfo }),
  };

  if (existing) {
    await db.walletActivity.update({
      where: { id: existing.id },
      data: updateData,
    });
    return existing.id;
  }

  const created = await db.walletActivity.create({
    data: {
      userId: params.userId,
      walletId: params.walletId,
      entityId: params.entityId,
      ...updateData,
    },
  });
  return created.id;
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
  const entityId = inviteeReferralActivityEntityId(userId);
  const client = db ?? prisma;
  const existing = await findReferralActivityByEntityId(
    userId,
    walletId,
    entityId,
    client
  );
  if (
    existing &&
    existing.kind !== "referral_bonus_pending"
  ) {
    return;
  }

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
        occurredAt: existing?.occurredAt ?? now,
        chainFinal: true,
      },
    },
    client
  );
}

export async function clearReferralPendingActivity(userId: string) {
  const entityId = inviteeReferralActivityEntityId(userId);
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
    inviteeDisplayName: string;
  },
  db?: Prisma.TransactionClient
) {
  const entityId = inviterReferralActivityEntityId(params.inviteId);
  const client = db ?? prisma;
  const existing = await findReferralActivityByEntityId(
    params.inviterUserId,
    params.walletId,
    entityId,
    client
  );
  if (
    existing &&
    existing.kind !== "referral_bonus_pending"
  ) {
    return;
  }

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
        detail: params.inviteeDisplayName,
        pendingTapInfo,
        occurredAt: existing?.occurredAt ?? now,
        chainFinal: true,
      },
    },
    client
  );
}

export async function ensureInviterReferralPendingActivity(
  inviterUserId: string,
  inviteId: string,
  inviteeDisplayName: string,
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
      inviteeDisplayName,
    },
    db
  );
}

export async function clearInviterReferralPendingActivity(inviteId: string) {
  const entityId = inviterReferralActivityEntityId(inviteId);
  await prisma.walletActivity.deleteMany({
    where: {
      kind: "referral_bonus_pending",
      entityId,
    },
  });
}

export async function markInviteeReferralProcessingActivity(
  userId: string,
  walletId: string
) {
  const entityId = inviteeReferralActivityEntityId(userId);
  const amount = REFERRAL_INVITEE_BONUS_USDT();
  const existing = await findReferralActivityByEntityId(
    userId,
    walletId,
    entityId
  );

  await transitionReferralActivity({
    userId,
    walletId,
    entityId,
    nextKind: "referral_bonus_processing",
    data: {
      type: "in",
      amountUsdt: amount,
      status: "processing",
      label: "Referral bonus",
      detail: existing?.detail ?? null,
      pendingTapInfo: buildReferralProcessingTapInfo(amount),
      occurredAt: existing?.occurredAt,
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
      ? principalRecoveryActivityEntityId(
          inviteKey.slice("principal-".length)
        )
      : inviterReferralActivityEntityId(inviteKey);
  const amount = inviteKey.startsWith("principal-")
    ? REFERRAL_RECOVERY_PRINCIPAL_USDT()
    : REFERRAL_INVITER_BONUS_USDT();
  const existing = await findReferralActivityByEntityId(
    userId,
    walletId,
    entityId
  );

  await transitionReferralActivity({
    userId,
    walletId,
    entityId,
    nextKind: "referral_bonus_processing",
    data: {
      type: "in",
      amountUsdt: amount,
      status: "processing",
      label: inviteKey.startsWith("principal-")
        ? "Investment recovered"
        : "Referral reward",
      detail: existing?.detail ?? null,
      pendingTapInfo: buildReferralProcessingTapInfo(amount),
      occurredAt: existing?.occurredAt,
      chainFinal: false,
    },
  });
}

export async function creditReferralWalletActivity(params: {
  userId: string;
  walletId: string;
  entityId: string;
  amountUsdt: number;
  label: string;
  detail?: string | null;
  txId: string;
  tronscanUrl: string;
}) {
  const existing = await findReferralActivityByEntityId(
    params.userId,
    params.walletId,
    params.entityId
  );

  await transitionReferralActivity({
    userId: params.userId,
    walletId: params.walletId,
    entityId: params.entityId,
    nextKind: "referral_bonus_credited",
    data: {
      type: "in",
      amountUsdt: params.amountUsdt,
      status: "confirmed",
      label: params.label,
      detail: params.detail ?? existing?.detail ?? null,
      pendingTapInfo: null,
      occurredAt: new Date(),
      chainFinal: true,
      txId: params.txId,
      tronscanUrl: params.tronscanUrl,
    },
  });
}

/** @deprecated Use creditReferralWalletActivity */
export async function createReferralBonusActivity(params: {
  userId: string;
  walletId: string;
  rewardId: string;
  amountUsdt: number;
  label: string;
}) {
  await upsertWalletActivityByEntity({
    userId: params.userId,
    walletId: params.walletId,
    kind: "referral_bonus_credited",
    entityId: `referral-reward-${params.rewardId}`,
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
