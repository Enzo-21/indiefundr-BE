import {
  WithdrawalOrderStatus,
  WithdrawalOrderStep,
  type WithdrawalOrder,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import { buildIndieFundrMemo, isIndieFundrChainMemoEnabled } from "@/lib/tron/transactionMemo";
import { rebuildWalletActivity } from "@/services/wallets/walletActivityMaterializer";
import {
  appendAutopilotNote,
  formatOrderAutopilotManualCheckNote,
} from "@/lib/admin/autopilotBatch";
import {
  ADMIN_TRX_TOPUP_BUFFER_RATIO,
  computeAdminTrxTopUpAmount,
  type AdminFulfillmentEstimate,
  type AdminTrxTopUpResult,
} from "@/services/admin/purchaseOrderFulfillment";
import * as feeSponsorship from "@/services/tron/feeSponsorship";
import * as tron from "@/services/tron/client";

const OPEN_STATUSES: WithdrawalOrderStatus[] = [
  WithdrawalOrderStatus.queued,
  WithdrawalOrderStatus.processing,
];

function logWithdrawalAdmin(
  orderId: string,
  step: string,
  payload: Record<string, unknown> = {}
) {
  console.log("[admin-withdrawal]", { orderId, step, ...payload });
}

function getTreasuryPrivateKey(): string {
  const pk = getEnv().treasuryPrivateKey?.trim();
  if (!pk) {
    throw new Error("Treasury private key is not configured");
  }
  return pk;
}

async function loadOpenWithdrawal(orderId: string): Promise<WithdrawalOrder> {
  const order = await prisma.withdrawalOrder.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new Error("Withdrawal order not found");
  }
  if (!OPEN_STATUSES.includes(order.status)) {
    throw new Error("Withdrawal order is no longer open");
  }
  return order;
}

export async function recordWithdrawalAdminTrxTopUp(
  orderId: string,
  txId: string,
  adminEmail: string
): Promise<void> {
  const trimmed = txId.trim();
  if (!trimmed) {
    throw new Error("Transaction id is required");
  }
  const order = await loadOpenWithdrawal(orderId);
  await prisma.withdrawalOrder.update({
    where: { id: orderId },
    data: {
      adminTrxTopUpTxId: trimmed,
      status: WithdrawalOrderStatus.processing,
      step:
        order.step === WithdrawalOrderStep.awaiting_trx
          ? WithdrawalOrderStep.awaiting_usdt
          : order.step,
      adminSettledBy: adminEmail,
      updatedAt: new Date(),
    },
  });
}

export async function recordWithdrawalAdminUsdtTx(
  orderId: string,
  txId: string,
  adminEmail?: string
): Promise<void> {
  const trimmed = txId.trim();
  if (!trimmed) {
    throw new Error("Transaction id is required");
  }
  await loadOpenWithdrawal(orderId);
  const chainMemo = isIndieFundrChainMemoEnabled()
    ? buildIndieFundrMemo({
        kind: "withdraw",
        fundId: "withdraw",
        entityId: orderId,
      })
    : undefined;

  await prisma.withdrawalOrder.update({
    where: { id: orderId },
    data: {
      adminUsdtTxId: trimmed,
      usdtTxId: trimmed,
      chainMemo,
      status: WithdrawalOrderStatus.processing,
      step: WithdrawalOrderStep.awaiting_review,
      ...(adminEmail ? { adminSettledBy: adminEmail } : {}),
      updatedAt: new Date(),
    },
  });
}

export async function getWithdrawalFulfillmentEstimate(
  orderId: string
): Promise<AdminFulfillmentEstimate> {
  const order = await loadOpenWithdrawal(orderId);
  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.address) {
    throw new Error("User wallet not found");
  }

  const feeEstimate = await tron.estimateUsdtTransfer({
    fromAddress: wallet.address,
    toAddress: order.destinationAddress,
    amount: order.amountUsdt,
  });

  const shortfall = feeSponsorship.computeSponsorShortfall(feeEstimate);

  return {
    estimatedTrx: feeEstimate.estimatedTrx,
    trxBalance: feeEstimate.trxBalance,
    shortfall,
    hasEnoughTrx: feeEstimate.hasEnoughTrx,
    hasEnoughUsdt: feeEstimate.hasEnoughUsdt,
    costUsdt: order.amountUsdt,
  };
}

export async function broadcastWithdrawalAdminTrxTopUp(
  orderId: string
): Promise<AdminTrxTopUpResult> {
  logWithdrawalAdmin(orderId, "trx_topup_start");
  const order = await loadOpenWithdrawal(orderId);
  const treasuryAddress = getEnv().treasuryAddress;
  if (!treasuryAddress) {
    throw new Error("Treasury address is not configured");
  }

  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.privateKey) {
    throw new Error("User wallet not found");
  }

  const feeEstimate = await tron.estimateUsdtTransfer({
    fromAddress: wallet.address,
    toAddress: order.destinationAddress,
    amount: order.amountUsdt,
  });

  const amountTrx = computeAdminTrxTopUpAmount(feeEstimate);
  const shortfall = feeSponsorship.computeSponsorShortfall(feeEstimate);
  const baseResult = {
    estimatedTrx: feeEstimate.estimatedTrx,
    trxBalance: feeEstimate.trxBalance,
    shortfall,
    targetTrx: parseFloat(
      (feeEstimate.estimatedTrx * ADMIN_TRX_TOPUP_BUFFER_RATIO).toFixed(6)
    ),
    bufferRatio: ADMIN_TRX_TOPUP_BUFFER_RATIO,
  };

  if (amountTrx <= 0) {
    await prisma.withdrawalOrder.update({
      where: { id: orderId },
      data: {
        status: WithdrawalOrderStatus.processing,
        step: WithdrawalOrderStep.awaiting_usdt,
        updatedAt: new Date(),
      },
    });
    return { ...baseResult, skipped: true, txId: null, amountTrx: 0 };
  }

  const treasuryPk = getTreasuryPrivateKey();
  await feeSponsorship.assertCanSponsor(order.userId, amountTrx, {
    existingSponsoredOnOrder: 0,
  });

  const signed = await tron.transferTrx({
    fromPrivateKey: treasuryPk,
    toAddress: wallet.address,
    amountTrx,
  });
  const txId = tron.getTxId(signed);
  if (!txId) {
    throw new Error("TRX broadcast missing transaction id");
  }

  await prisma.withdrawalOrder.update({
    where: { id: orderId },
    data: {
      adminTrxTopUpTxId: txId,
      status: WithdrawalOrderStatus.processing,
      step: WithdrawalOrderStep.awaiting_usdt,
      updatedAt: new Date(),
    },
  });

  return { ...baseResult, skipped: false, txId, amountTrx };
}

export async function broadcastWithdrawalAdminUsdt(
  orderId: string
): Promise<string> {
  logWithdrawalAdmin(orderId, "usdt_broadcast_start");
  const order = await loadOpenWithdrawal(orderId);
  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.privateKey) {
    throw new Error("User wallet not found");
  }

  const chainMemo = isIndieFundrChainMemoEnabled()
    ? buildIndieFundrMemo({
        kind: "withdraw",
        fundId: "withdraw",
        entityId: order.id,
      })
    : undefined;

  const signed = await tron.transferUsdt({
    fromPrivateKey: wallet.privateKey,
    toAddress: order.destinationAddress,
    amount: order.amountUsdt,
    memo: chainMemo,
  });

  const txId = tron.getTxId(signed);
  if (!txId) {
    throw new Error("USDT broadcast missing transaction id");
  }

  await recordWithdrawalAdminUsdtTx(orderId, txId);
  logWithdrawalAdmin(orderId, "usdt_broadcast_success", { txId });
  return txId;
}

export async function markAdminWithdrawalSuccess(
  orderId: string,
  adminEmail: string
): Promise<void> {
  const order = await prisma.withdrawalOrder.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new Error("Withdrawal order not found");
  }
  if (order.status === WithdrawalOrderStatus.completed) {
    return;
  }
  const usdtTxId = order.usdtTxId ?? order.adminUsdtTxId;
  if (!usdtTxId) {
    throw new Error("Record USDT payment tx id before marking successful");
  }

  await prisma.withdrawalOrder.update({
    where: { id: orderId },
    data: {
      status: WithdrawalOrderStatus.completed,
      step: WithdrawalOrderStep.done,
      usdtTxId,
      adminUsdtTxId: usdtTxId,
      paymentChainOutcome: "success",
      paymentChainTxId: usdtTxId,
      paymentChainFinal: true,
      adminSettledAt: new Date(),
      adminSettledBy: adminEmail,
      updatedAt: new Date(),
    },
  });

  await rebuildWalletActivity(order.userId, order.walletId, order.walletId);
}

export async function appendAdminWithdrawalAutopilotManualCheckNote(
  orderId: string,
  error: string,
  adminEmail: string
): Promise<void> {
  const order = await loadOpenWithdrawal(orderId);
  const line = formatOrderAutopilotManualCheckNote(error);
  const notes = appendAutopilotNote(order.adminNotes, line);
  await prisma.withdrawalOrder.update({
    where: { id: orderId },
    data: {
      adminNotes: notes,
      adminSettledBy: adminEmail,
      updatedAt: new Date(),
    },
  });
}

export async function markAdminWithdrawalFailed(
  orderId: string,
  reason: string,
  adminEmail: string
): Promise<void> {
  const order = await loadOpenWithdrawal(orderId);
  await prisma.withdrawalOrder.update({
    where: { id: orderId },
    data: {
      status: WithdrawalOrderStatus.failed,
      step: WithdrawalOrderStep.done,
      failureReason: reason.trim() || "Marked failed by admin",
      paymentChainFinal: true,
      adminSettledAt: new Date(),
      adminSettledBy: adminEmail,
      updatedAt: new Date(),
    },
  });
  await rebuildWalletActivity(order.userId, order.walletId, order.walletId);
}

export type AdminWithdrawalRow = {
  orderType: "withdraw";
  orderId: string;
  userId: string;
  userEmail: string;
  userName: string;
  fundId: string;
  fundName: string;
  destinationAddress: string;
  costUsdt: number;
  reservedUsdt: number;
  status: WithdrawalOrderStatus;
  step: WithdrawalOrderStep;
  walletAddress: string;
  trxBalance: number | null;
  usdtBalance: number | null;
  balanceReadStatus: "ok" | "rate_limited" | "read_failed";
  estimatedTrx: number | null;
  topUpTxId: string | null;
  usdtTxId: string | null;
  adminTrxTopUpTxId: string | null;
  adminUsdtTxId: string | null;
  adminNotes: string | null;
  topUpTronscanUrl: string | null;
  usdtTronscanUrl: string | null;
  normalizedDateIso: string;
  date: string;
  updatedAt: string;
};

export async function listAdminWithdrawalQueue(): Promise<AdminWithdrawalRow[]> {
  const orders = await prisma.withdrawalOrder.findMany({
    where: { status: { in: OPEN_STATUSES } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    include: {
      user: { select: { email: true, name: true } },
      wallet: { select: { address: true } },
    },
  });

  const rows: AdminWithdrawalRow[] = [];
  for (const order of orders) {
    let trxBalance: number | null = null;
    let usdtBalance: number | null = null;
    let balanceReadStatus: AdminWithdrawalRow["balanceReadStatus"] = "ok";

    if (
      order.wallet?.address &&
      (await tron.validateAddress(order.wallet.address))
    ) {
      try {
        [trxBalance, usdtBalance] = await Promise.all([
          tron.getTrxBalance(order.wallet.address),
          tron.getUsdtBalance(order.wallet.address),
        ]);
      } catch {
        trxBalance = null;
        usdtBalance = null;
        balanceReadStatus = "read_failed";
      }
    } else {
      balanceReadStatus = "read_failed";
    }

    const topUpTxId = order.adminTrxTopUpTxId;
    const usdtTxId = order.usdtTxId ?? order.adminUsdtTxId;

    rows.push({
      orderType: "withdraw",
      orderId: order.id,
      userId: order.userId,
      userEmail: order.user.email,
      userName: order.user.name,
      fundId: "withdraw",
      fundName: "Withdrawal",
      destinationAddress: order.destinationAddress,
      costUsdt: order.amountUsdt,
      reservedUsdt: order.reservedUsdt,
      status: order.status,
      step: order.step,
      walletAddress: order.wallet?.address ?? "",
      trxBalance,
      usdtBalance,
      balanceReadStatus,
      estimatedTrx: order.estimatedTrx,
      topUpTxId,
      usdtTxId,
      adminTrxTopUpTxId: order.adminTrxTopUpTxId,
      adminUsdtTxId: order.adminUsdtTxId,
      adminNotes: order.adminNotes,
      topUpTronscanUrl: topUpTxId ? getTronscanTxUrl(topUpTxId) : null,
      usdtTronscanUrl: usdtTxId ? getTronscanTxUrl(usdtTxId) : null,
      normalizedDateIso: order.date.toISOString(),
      date: order.date.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    });
  }
  return rows;
}
