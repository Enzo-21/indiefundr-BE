import {
  InvestmentStatus,
  ReferralPayoutOrderKind,
  ReferralPayoutOrderStatus,
  ReferralRewardRole,
  ReferralRewardStatus,
  type ReferralPayoutOrder,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import {
  appendAutopilotNote,
  formatOrderAutopilotManualCheckNote,
} from "@/lib/admin/autopilotBatch";
import {
  buildIndieFundrMemo,
  isIndieFundrChainMemoEnabled,
} from "@/lib/tron/transactionMemo";
import { formatTronTransferError } from "@/lib/utils/tronErrors";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import type { AdminFulfillmentEstimate } from "@/services/admin/purchaseOrderFulfillment";
import { referralPayoutOrderKindLabel } from "@/services/referrals/referralPayoutOrderQueue";
import {
  creditReferralWalletActivity,
  inviteeReferralActivityEntityId,
  inviterReferralActivityEntityId,
  principalRecoveryActivityEntityId,
} from "@/services/referrals/referralWalletActivity";
import {
  getLedgerSnapshot,
  recordReferralBonusOutflow,
  recordReferralPrincipalRecovery,
  type LedgerSnapshot,
} from "@/services/revenueEngine/ledger";
import * as tron from "@/services/tron/client";
import { scheduleUserLevelRecalculation } from "@/services/playerLevels/scheduleUserLevelRecalculation";

const OPEN_STATUSES: ReferralPayoutOrderStatus[] = [
  ReferralPayoutOrderStatus.queued,
  ReferralPayoutOrderStatus.processing,
];

export type AdminReferralPayoutRow = {
  orderType: "referral";
  orderId: string;
  userId: string;
  userEmail: string;
  userName: string;
  kind: ReferralPayoutOrderKind;
  kindLabel: string;
  referralInviteId: string | null;
  investmentId: string | null;
  costUsdt: number;
  reservedUsdt: number;
  status: ReferralPayoutOrderStatus;
  walletAddress: string;
  trxBalance: number | null;
  usdtBalance: number | null;
  balanceReadStatus: "ok";
  estimatedTrx: number | null;
  topUpTxId: null;
  usdtTxId: string | null;
  adminTrxTopUpTxId: null;
  adminUsdtTxId: string | null;
  adminNotes: string | null;
  topUpTronscanUrl: null;
  usdtTronscanUrl: string | null;
  normalizedDateIso: string;
  date: string;
  updatedAt: string;
};

export type ReferralPayoutFulfillmentEstimate = AdminFulfillmentEstimate & {
  treasuryUsdtBalance: number;
  treasuryTrxBalance: number;
  ledgerTreasurySurplus: number;
  ledgerPoolAvailable: number;
  canTransfer: boolean;
};

export function assertReferralLedgerLiquidity(
  kind: ReferralPayoutOrderKind,
  amountUsdt: number,
  snapshot: LedgerSnapshot
): void {
  if (kind === ReferralPayoutOrderKind.principal_recovery) {
    if (snapshot.poolAvailable < amountUsdt) {
      throw new Error(
        `Insufficient pool liquidity for principal recovery: need ${amountUsdt}, available ${snapshot.poolAvailable}`
      );
    }
    return;
  }

  if (snapshot.treasurySurplus < amountUsdt) {
    throw new Error(
      `Insufficient treasury surplus for referral bonus: need ${amountUsdt}, available ${snapshot.treasurySurplus}`
    );
  }
}

function formatTreasuryTransferPreflightError(
  estimate: tron.UsdtTransferEstimate,
  treasuryAddress: string,
  amountUsdt: number,
  snapshot: LedgerSnapshot
): string {
  const formatted = formatTronTransferError(
    estimate.hasEnoughUsdt ? "insufficient trx for fees" : "insufficient usdt",
    {
      fromAddress: treasuryAddress,
      trxBalance: estimate.trxBalance,
      usdtBalance: estimate.usdtBalance,
      amountUsdt,
      estimatedTrx: estimate.estimatedTrx,
    }
  );
  const base =
    typeof formatted.msg === "string"
      ? formatted.msg
      : "Treasury cannot cover this referral payout";
  const ledgerHint =
    amountUsdt <= snapshot.treasurySurplus || amountUsdt <= snapshot.poolAvailable
      ? ` Ledger shows sufficient funds (surplus ${snapshot.treasurySurplus}, pool ${snapshot.poolAvailable}) but on-chain treasury USDT is ${estimate.usdtBalance}.`
      : "";
  return `${base}${ledgerHint}`;
}

async function assertReferralPayoutBroadcastReady(
  order: ReferralPayoutOrder,
  toAddress: string
): Promise<{ treasuryAddress: string; estimate: tron.UsdtTransferEstimate }> {
  if (!(await tron.validateAddress(toAddress))) {
    throw new Error("User wallet address is invalid");
  }

  const treasuryPk = getTreasuryPrivateKey();
  const treasuryAddress = await tron.privateKeyToAddress(treasuryPk);
  const snapshot = await getLedgerSnapshot();
  assertReferralLedgerLiquidity(order.kind, order.amountUsdt, snapshot);

  const estimate = await tron.estimateUsdtTransfer({
    fromAddress: treasuryAddress,
    toAddress,
    amount: order.amountUsdt,
  });

  if (!estimate.canTransfer) {
    throw new Error(
      formatTreasuryTransferPreflightError(
        estimate,
        treasuryAddress,
        order.amountUsdt,
        snapshot
      )
    );
  }

  return { treasuryAddress, estimate };
}

function getTreasuryPrivateKey(): string {
  const pk = getEnv().treasuryPrivateKey?.trim();
  if (!pk) {
    throw new Error("Treasury private key is not configured");
  }
  return pk;
}

async function loadOpenReferralOrder(orderId: string): Promise<ReferralPayoutOrder> {
  const order = await prisma.referralPayoutOrder.findUnique({
    where: { id: orderId },
  });
  if (!order) {
    throw new Error("Referral payout order not found");
  }
  if (!OPEN_STATUSES.includes(order.status)) {
    throw new Error("Referral payout order is no longer open");
  }
  return order;
}

export async function listAdminReferralPayoutQueue(): Promise<AdminReferralPayoutRow[]> {
  const orders = await prisma.referralPayoutOrder.findMany({
    where: { status: { in: OPEN_STATUSES } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    include: {
      user: { select: { email: true, name: true } },
      wallet: { select: { address: true } },
    },
  });

  return orders.map((order) => {
    const usdtTxId = order.usdtTxId;
    return {
      orderType: "referral" as const,
      orderId: order.id,
      userId: order.userId,
      userEmail: order.user.email,
      userName: order.user.name,
      kind: order.kind,
      kindLabel: referralPayoutOrderKindLabel(order.kind),
      referralInviteId: order.referralInviteId,
      investmentId: order.investmentId,
      costUsdt: order.amountUsdt,
      reservedUsdt: 0,
      status: order.status,
      walletAddress: order.wallet.address,
      trxBalance: null,
      usdtBalance: null,
      balanceReadStatus: "ok" as const,
      estimatedTrx: null,
      topUpTxId: null,
      usdtTxId,
      adminTrxTopUpTxId: null,
      adminUsdtTxId: usdtTxId,
      adminNotes: order.failureReason,
      topUpTronscanUrl: null,
      usdtTronscanUrl: usdtTxId ? getTronscanTxUrl(usdtTxId) : null,
      normalizedDateIso: order.date.toISOString(),
      date: order.date.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  });
}

export async function getReferralPayoutFulfillmentEstimate(
  orderId: string
): Promise<ReferralPayoutFulfillmentEstimate> {
  const order = await loadOpenReferralOrder(orderId);
  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.address) {
    throw new Error("User wallet not found");
  }

  const treasuryPk = getTreasuryPrivateKey();
  const treasuryAddress = await tron.privateKeyToAddress(treasuryPk);
  const snapshot = await getLedgerSnapshot();

  let ledgerOk = true;
  try {
    assertReferralLedgerLiquidity(order.kind, order.amountUsdt, snapshot);
  } catch {
    ledgerOk = false;
  }

  const feeEstimate = await tron.estimateUsdtTransfer({
    fromAddress: treasuryAddress,
    toAddress: wallet.address,
    amount: order.amountUsdt,
  });

  const shortfall = Math.max(
    0,
    parseFloat((feeEstimate.estimatedTrx - feeEstimate.trxBalance).toFixed(6))
  );

  return {
    estimatedTrx: feeEstimate.estimatedTrx,
    trxBalance: feeEstimate.trxBalance,
    shortfall,
    hasEnoughTrx: feeEstimate.hasEnoughTrx,
    hasEnoughUsdt: feeEstimate.hasEnoughUsdt,
    costUsdt: order.amountUsdt,
    treasuryUsdtBalance: feeEstimate.usdtBalance,
    treasuryTrxBalance: feeEstimate.trxBalance,
    ledgerTreasurySurplus: snapshot.treasurySurplus,
    ledgerPoolAvailable: snapshot.poolAvailable,
    canTransfer: feeEstimate.canTransfer && ledgerOk,
  };
}

export async function resetReferralPayoutUsdtForRetry(
  orderId: string,
  options: { appendNote?: string } = {}
): Promise<void> {
  const order = await prisma.referralPayoutOrder.findUnique({
    where: { id: orderId },
  });
  if (!order) {
    throw new Error("Referral payout order not found");
  }
  if (!OPEN_STATUSES.includes(order.status)) {
    throw new Error("Referral payout order is no longer open");
  }

  await prisma.referralPayoutOrder.update({
    where: { id: orderId },
    data: {
      usdtTxId: null,
      status: ReferralPayoutOrderStatus.queued,
      failureReason: options.appendNote
        ? appendAutopilotNote(order.failureReason, options.appendNote)
        : order.failureReason,
      updatedAt: new Date(),
    },
  });
}

export async function broadcastReferralPayoutUsdt(
  orderId: string,
  adminEmail?: string
): Promise<string> {
  let order = await loadOpenReferralOrder(orderId);
  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.address) {
    throw new Error("User wallet not found");
  }

  const existingTxId = order.usdtTxId?.trim();
  if (existingTxId) {
    const inspection = await tron.inspectTransactionOnChain(existingTxId);
    if (inspection.usdtTransferSuccessful) {
      return existingTxId;
    }
    if (inspection.status === "pending") {
      return existingTxId;
    }
    if (inspection.status === "failed") {
      await resetReferralPayoutUsdtForRetry(orderId, {
        appendNote: formatOrderAutopilotManualCheckNote(
          "Previous USDT broadcast failed on-chain; cleared tx id for retry"
        ),
      });
      order = await loadOpenReferralOrder(orderId);
    }
  }

  await assertReferralPayoutBroadcastReady(order, wallet.address);

  const treasuryPk = getTreasuryPrivateKey();
  const chainMemo = isIndieFundrChainMemoEnabled()
    ? buildIndieFundrMemo({
        kind: "payout",
        fundId: "referral",
        entityId: order.id,
      })
    : undefined;

  const signed = await tron.transferUsdt({
    fromPrivateKey: treasuryPk,
    toAddress: wallet.address,
    amount: order.amountUsdt,
    memo: chainMemo,
  });
  const txId = tron.getTxId(signed);
  if (!txId) {
    throw new Error("USDT broadcast missing transaction id");
  }

  await prisma.referralPayoutOrder.update({
    where: { id: orderId },
    data: {
      usdtTxId: txId,
      status: ReferralPayoutOrderStatus.processing,
      ...(adminEmail ? { adminSettledBy: adminEmail } : {}),
      updatedAt: new Date(),
    },
  });

  return txId;
}

export async function completeReferralPayoutOrder(
  orderId: string,
  adminEmail: string,
  usdtTxId?: string
): Promise<void> {
  const order = await prisma.referralPayoutOrder.findUnique({
    where: { id: orderId },
    include: {
      wallet: { select: { id: true, address: true } },
      referralReward: true,
    },
  });
  if (!order) {
    throw new Error("Referral payout order not found");
  }
  if (order.status === ReferralPayoutOrderStatus.completed) {
    return;
  }
  if (order.status === ReferralPayoutOrderStatus.failed) {
    throw new Error("Referral payout order is marked failed");
  }

  const txId = (usdtTxId ?? order.usdtTxId)?.trim();
  if (!txId) {
    throw new Error("USDT transaction id is required to complete referral payout");
  }

  const transferOk = await tron.isUsdtTransferSuccessful(txId);
  if (!transferOk) {
    const failure = await tron.getTransactionFailureReason(txId);
    throw new Error(
      failure.message || "USDT transfer did not succeed on-chain"
    );
  }

  if (order.kind === ReferralPayoutOrderKind.principal_recovery) {
    if (!order.investmentId) {
      throw new Error("Principal recovery order is missing investment id");
    }
    await recordReferralPrincipalRecovery(order.amountUsdt, order.investmentId, {
      inviterUserId: order.userId,
      referralPayoutOrderId: order.id,
    });
  } else {
    const role =
      order.kind === ReferralPayoutOrderKind.invitee_bonus
        ? ReferralRewardRole.invitee_bonus
        : ReferralRewardRole.inviter_bonus;
    await recordReferralBonusOutflow(order.amountUsdt, {
      role,
      referralInviteId: order.referralInviteId,
      userId: order.userId,
      referralPayoutOrderId: order.id,
    });
  }

  const reward =
    order.referralReward ??
    (await prisma.referralReward.findFirst({
      where: { referralPayoutOrderId: orderId },
    }));
  const label =
    order.kind === ReferralPayoutOrderKind.principal_recovery
      ? "Principal recovered"
      : order.kind === ReferralPayoutOrderKind.invitee_bonus
        ? "Referral bonus"
        : "Referral reward";

  let activityEntityId: string;
  if (order.kind === ReferralPayoutOrderKind.invitee_bonus) {
    activityEntityId = inviteeReferralActivityEntityId(order.userId);
  } else if (order.kind === ReferralPayoutOrderKind.inviter_bonus) {
    if (!order.referralInviteId) {
      throw new Error("Inviter bonus order is missing referral invite id");
    }
    activityEntityId = inviterReferralActivityEntityId(order.referralInviteId);
  } else if (!order.investmentId) {
    throw new Error("Principal recovery order is missing investment id");
  } else {
    activityEntityId = principalRecoveryActivityEntityId(order.investmentId);
  }

  let activityDetail: string | null = null;
  if (order.referralInviteId) {
    const invite = await prisma.referralInvite.findUnique({
      where: { id: order.referralInviteId },
      include: {
        invitee: { select: { name: true } },
        inviter: { select: { name: true } },
        referralCode: { select: { code: true } },
      },
    });
    if (invite) {
      if (order.kind === ReferralPayoutOrderKind.invitee_bonus) {
        activityDetail = invite.referralCode.code;
      } else if (order.kind === ReferralPayoutOrderKind.inviter_bonus) {
        activityDetail = invite.invitee.name;
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.referralPayoutOrder.update({
      where: { id: orderId },
      data: {
        usdtTxId: txId,
        status: ReferralPayoutOrderStatus.completed,
        adminSettledBy: adminEmail,
        failureReason: null,
        updatedAt: new Date(),
      },
    });

    if (reward) {
      await tx.referralReward.update({
        where: { id: reward.id },
        data: {
          status: ReferralRewardStatus.credited,
          creditedAt: new Date(),
        },
      });
    }

    if (
      order.kind === ReferralPayoutOrderKind.principal_recovery &&
      order.investmentId
    ) {
      const link = await tx.referralRecoveryLink.findUnique({
        where: { investmentId: order.investmentId },
      });

      await tx.investment.update({
        where: { id: order.investmentId },
        data: {
          status: InvestmentStatus.referral_recovered,
          referralRecoveryCompletedAt: new Date(),
          recoveryEligibleAt: null,
          redeemedAt: new Date(),
          redemptionTransaction: { txId } as object,
        },
      });

      if (link) {
        await tx.referralRecoveryLink.update({
          where: { id: link.id },
          data: { completedAt: new Date() },
        });
      }
    }
  });

  await creditReferralWalletActivity({
    userId: order.userId,
    walletId: order.wallet.id,
    entityId: activityEntityId,
    amountUsdt: order.amountUsdt,
    label,
    detail: activityDetail,
    txId,
    tronscanUrl: getTronscanTxUrl(txId),
  });

  if (order.kind === ReferralPayoutOrderKind.principal_recovery) {
    scheduleUserLevelRecalculation(order.userId);
  }

  try {
    const { notifyReferralPayoutOrderCompleted } = await import(
      "@/services/mailing/notifyUserPayment"
    );
    await notifyReferralPayoutOrderCompleted({ order, txId });
  } catch (notifyErr) {
    const message =
      notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
    console.error("[mail] notifyReferralPayoutOrderCompleted failed:", message, {
      orderId: order.id,
    });
  }
}

export async function markReferralPayoutOrderFailed(
  orderId: string,
  reason: string,
  adminEmail?: string
): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error("Failure reason is required");
  }

  await loadOpenReferralOrder(orderId);

  await prisma.$transaction([
    prisma.referralPayoutOrder.update({
      where: { id: orderId },
      data: {
        status: ReferralPayoutOrderStatus.failed,
        failureReason: trimmed,
        ...(adminEmail ? { adminSettledBy: adminEmail } : {}),
        updatedAt: new Date(),
      },
    }),
    prisma.referralReward.updateMany({
      where: { referralPayoutOrderId: orderId },
      data: { status: ReferralRewardStatus.failed },
    }),
  ]);
}

export async function appendAdminReferralPayoutAutopilotManualCheckNote(
  orderId: string,
  error: string,
  adminEmail: string
): Promise<void> {
  const order = await loadOpenReferralOrder(orderId);
  const line = formatOrderAutopilotManualCheckNote(error);
  const notes = appendAutopilotNote(order.failureReason, line);
  await prisma.referralPayoutOrder.update({
    where: { id: orderId },
    data: {
      failureReason: notes,
      adminSettledBy: adminEmail,
      updatedAt: new Date(),
    },
  });
}
