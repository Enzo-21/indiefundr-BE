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
  computeAdminRecoverableTrx,
  computeAdminTrxTopUpAmount,
  type AdminFulfillmentEstimate,
  type AdminRecoverTrxResult,
  type AdminSponsorResourcesResult,
  type AdminTrxTopUpResult,
} from "@/services/admin/purchaseOrderFulfillment";
import * as feeSponsorship from "@/services/tron/feeSponsorship";
import * as tron from "@/services/tron/client";
import {
  finalizeSponsoredResources,
  shouldRecoverSponsoredTrx,
  sponsorTransferResources,
} from "@/services/tron/resourceSponsorship";

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

function getTreasuryAddressOrThrow(): string {
  const address = getEnv().treasuryAddress?.trim();
  if (!address) {
    throw new Error("Treasury address is not configured");
  }
  return address;
}

async function resolveWithdrawalSender(order: WithdrawalOrder): Promise<{
  address: string;
  privateKey: string;
  fromTreasury: boolean;
}> {
  if (order.fromTreasury) {
    return {
      address: getTreasuryAddressOrThrow(),
      privateKey: getTreasuryPrivateKey(),
      fromTreasury: true,
    };
  }

  if (!order.walletId) {
    throw new Error("User wallet not found");
  }
  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.address || !wallet.privateKey) {
    throw new Error("User wallet not found");
  }
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    fromTreasury: false,
  };
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
  const sender = await resolveWithdrawalSender(order);

  const feeEstimate = await tron.estimateUsdtTransfer({
    fromAddress: sender.address,
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
    hasEnoughEnergy: feeEstimate.hasEnoughEnergy,
    hasEnoughBandwidth: feeEstimate.hasEnoughBandwidth,
    canTransferZeroBurn: feeEstimate.canTransferZeroBurn,
    energyUsed: feeEstimate.energyUsed,
    energyAvailable: feeEstimate.energyAvailable,
    energyShortfall: feeEstimate.energyShortfall,
    bandwidthAvailable: feeEstimate.bandwidthAvailable,
    bandwidthShortfall: feeEstimate.bandwidthShortfall,
    costUsdt: order.amountUsdt,
  };
}

export async function sponsorWithdrawalTransferResources(
  orderId: string
): Promise<AdminSponsorResourcesResult> {
  logWithdrawalAdmin(orderId, "sponsor_resources_start");
  const order = await loadOpenWithdrawal(orderId);
  const sender = await resolveWithdrawalSender(order);

  const result = await sponsorTransferResources({
    orderKind: "withdrawal",
    orderId,
    fromAddress: sender.address,
    toAddress: order.destinationAddress,
    amountUsdt: order.amountUsdt,
    userId: order.userId ?? "treasury",
    existingSponsoredTrx: order.sponsoredTrx || 0,
    existingTopUpTxIds: order.topUpTxIds ?? [],
  });

  const txId =
    result.topUpTxId ?? result.energyRentTxId ?? result.bandwidthRentTxId;

  logWithdrawalAdmin(orderId, "sponsor_resources_done", {
    mode: result.mode,
    skipped: result.skipped,
    txId,
    detail: result.detail,
    fromTreasury: sender.fromTreasury,
  });

  return {
    mode: result.mode,
    skipped: result.skipped,
    txId,
    amountTrx: result.amountTrx,
    estimatedTrx: result.estimate.estimatedTrx,
    trxBalance: result.estimate.trxBalance,
    shortfall: result.shortfall,
    targetTrx: result.targetTrx,
    bufferRatio: result.bufferRatio,
    detail: result.detail,
    energyRentTxId: result.energyRentTxId,
    bandwidthRentTxId: result.bandwidthRentTxId,
    energyTarget: result.energyTarget,
  };
}

export async function broadcastWithdrawalAdminTrxTopUp(
  orderId: string
): Promise<AdminTrxTopUpResult> {
  logWithdrawalAdmin(orderId, "trx_topup_start");
  const order = await loadOpenWithdrawal(orderId);
  const treasuryAddress = getTreasuryAddressOrThrow();
  const sender = await resolveWithdrawalSender(order);

  const feeEstimate = await tron.estimateUsdtTransfer({
    fromAddress: sender.address,
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

  if (amountTrx <= 0 || sender.fromTreasury) {
    await prisma.withdrawalOrder.update({
      where: { id: orderId },
      data: {
        status: WithdrawalOrderStatus.processing,
        step: WithdrawalOrderStep.awaiting_usdt,
        updatedAt: new Date(),
      },
    });
    return {
      ...baseResult,
      skipped: true,
      txId: null,
      amountTrx: 0,
    };
  }

  const treasuryPk = getTreasuryPrivateKey();
  await feeSponsorship.assertCanSponsor(order.userId ?? "treasury", amountTrx, {
    existingSponsoredOnOrder: 0,
  });

  const signed = await tron.transferTrx({
    fromPrivateKey: treasuryPk,
    toAddress: sender.address,
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
  const sender = await resolveWithdrawalSender(order);

  const chainMemo = isIndieFundrChainMemoEnabled()
    ? buildIndieFundrMemo({
        kind: "withdraw",
        fundId: "withdraw",
        entityId: order.id,
      })
    : undefined;

  const signed = await tron.transferUsdt({
    fromPrivateKey: sender.privateKey,
    toAddress: order.destinationAddress,
    amount: order.amountUsdt,
    memo: chainMemo,
  });

  const txId = tron.getTxId(signed);
  if (!txId) {
    throw new Error("USDT broadcast missing transaction id");
  }

  await recordWithdrawalAdminUsdtTx(orderId, txId);
  logWithdrawalAdmin(orderId, "usdt_broadcast_success", {
    txId,
    fromTreasury: sender.fromTreasury,
  });
  return txId;
}

export async function recoverWithdrawalSponsoredTrx(
  orderId: string
): Promise<AdminRecoverTrxResult> {
  logWithdrawalAdmin(orderId, "recover_start");
  const order = await loadOpenWithdrawal(orderId);

  const treasuryAddress = getTreasuryAddressOrThrow();

  const finalized = await finalizeSponsoredResources({
    orderKind: "withdrawal",
    orderId,
  });

  if (finalized.mode === "justlend_rent" || finalized.mode === "user_resources") {
    logWithdrawalAdmin(orderId, "recover_skip", {
      reason: finalized.detail,
      mode: finalized.mode,
      energyReturnTxId: finalized.energyReturnTxId,
    });
    return {
      skipped: true,
      sweepTxId: finalized.energyReturnTxId,
      recoveredTrx: 0,
      sponsoredTrx: order.sponsoredTrx || 0,
      recoverableTrx: 0,
      reason: finalized.detail,
    };
  }

  if (order.fromTreasury) {
    return {
      skipped: true,
      sweepTxId: null,
      recoveredTrx: 0,
      sponsoredTrx: order.sponsoredTrx || 0,
      recoverableTrx: 0,
      reason: "Treasury withdrawal — no TRX sweep",
    };
  }

  if (!shouldRecoverSponsoredTrx(order)) {
    return {
      skipped: true,
      sweepTxId: null,
      recoveredTrx: 0,
      sponsoredTrx: order.sponsoredTrx || 0,
      recoverableTrx: 0,
      reason: "No sponsored TRX to recover",
    };
  }

  const sponsoredTrx = order.sponsoredTrx || 0;
  if (sponsoredTrx <= 0) {
    return {
      skipped: true,
      sweepTxId: null,
      recoveredTrx: 0,
      sponsoredTrx: 0,
      recoverableTrx: 0,
      reason: "No sponsored TRX to recover",
    };
  }

  if (order.recoveredTrx > 0 && order.sweepTxId) {
    return {
      skipped: true,
      sweepTxId: order.sweepTxId,
      recoveredTrx: order.recoveredTrx,
      sponsoredTrx,
      recoverableTrx: 0,
      reason: "TRX already recovered",
    };
  }

  if (!order.walletId) {
    throw new Error("User wallet not found");
  }
  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.privateKey || !wallet.address) {
    throw new Error("User wallet not found");
  }

  const reserveTrx = getEnv().sponsorTrxReserve;
  const trxBalance = await tron.getTrxBalance(wallet.address);
  const transferFee = await tron.estimateAdminSweepTransferFee(wallet.address);
  const transferFeeTrx = transferFee.estimatedTrx;
  const recoverableTrx = computeAdminRecoverableTrx({
    sponsoredTrx,
    currentTrxBalance: trxBalance,
    reserveTrx,
    transferFeeTrx,
  });

  if (recoverableTrx <= 0) {
    const reason = `Balance ${trxBalance.toFixed(4)} TRX, recoverable 0 TRX (reserve ${reserveTrx} TRX, sweep fee ${transferFeeTrx.toFixed(4)} TRX)`;
    return {
      skipped: true,
      sweepTxId: null,
      recoveredTrx: 0,
      trxBalance,
      sponsoredTrx,
      recoverableTrx: 0,
      transferFeeTrx,
      reason,
    };
  }

  let sweep: Record<string, unknown> | null = null;
  try {
    sweep = await tron.sweepTrxToTreasury({
      userPrivateKey: wallet.privateKey,
      treasuryAddress,
      maxAmountTrx: recoverableTrx,
      reserveTrx,
      trxBalanceBefore: order.trxBefore || trxBalance,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Withdrawal TRX sweep failed: ${message}`);
  }

  const sweepTxId = sweep ? tron.getTxId(sweep) : null;
  const recoveredTrx = sweepTxId
    ? Number((sweep as { amountTrx?: number }).amountTrx || 0)
    : 0;

  if (!sweepTxId || recoveredTrx <= 0) {
    return {
      skipped: true,
      sweepTxId: null,
      recoveredTrx: 0,
      trxBalance,
      sponsoredTrx,
      recoverableTrx,
      transferFeeTrx,
      reason: "Sweep produced no recoverable amount",
    };
  }

  await prisma.withdrawalOrder.update({
    where: { id: orderId },
    data: {
      sweepTxId,
      recoveredTrx,
      updatedAt: new Date(),
    },
  });

  logWithdrawalAdmin(orderId, "recover_success", { sweepTxId, recoveredTrx });
  return {
    skipped: false,
    sweepTxId,
    recoveredTrx,
    trxBalance,
    sponsoredTrx,
    recoverableTrx: recoveredTrx,
    transferFeeTrx,
  };
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

  const completed = await prisma.withdrawalOrder.findUnique({
    where: { id: orderId },
  });
  if (!completed) {
    throw new Error("Withdrawal order not found after completion");
  }

  if (completed.fromTreasury) {
    return;
  }

  if (!completed.userId || !completed.walletId) {
    return;
  }

  await rebuildWalletActivity(completed.userId, completed.walletId, completed.walletId);

  try {
    const { notifyUserPayment } = await import(
      "@/services/mailing/notifyUserPayment"
    );
    await notifyUserPayment({
      kind: "withdrawal",
      order: completed,
      txId: usdtTxId,
    });
  } catch (notifyErr) {
    const message =
      notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
    console.error("[mail] notifyUserPayment failed:", message, {
      orderId: completed.id,
    });
  }
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
  if (!order.fromTreasury && order.userId && order.walletId) {
    await rebuildWalletActivity(order.userId, order.walletId, order.walletId);
  }
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
  fromTreasury: boolean;
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

  const treasuryAddress = getEnv().treasuryAddress?.trim() ?? "";
  const rows: AdminWithdrawalRow[] = [];
  for (const order of orders) {
    let trxBalance: number | null = null;
    let usdtBalance: number | null = null;
    let balanceReadStatus: AdminWithdrawalRow["balanceReadStatus"] = "ok";

    const sourceAddress = order.fromTreasury
      ? treasuryAddress
      : (order.wallet?.address ?? "");

    if (sourceAddress && (await tron.validateAddress(sourceAddress))) {
      try {
        [trxBalance, usdtBalance] = await Promise.all([
          tron.getTrxBalance(sourceAddress),
          tron.getUsdtBalance(sourceAddress),
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
      userId: order.userId ?? "",
      userEmail: order.user?.email ?? order.adminSettledBy ?? "Treasury",
      userName: order.user?.name ?? "Treasury",
      fundId: "withdraw",
      fundName: order.fromTreasury ? "Treasury withdrawal" : "Withdrawal",
      destinationAddress: order.destinationAddress,
      costUsdt: order.amountUsdt,
      reservedUsdt: order.reservedUsdt,
      status: order.status,
      step: order.step,
      walletAddress: sourceAddress,
      fromTreasury: order.fromTreasury,
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
