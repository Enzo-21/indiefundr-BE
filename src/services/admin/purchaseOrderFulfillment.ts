import {
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  PurchaseOrderStep,
  type PurchaseOrder,
} from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import {
  appendAutopilotNote,
  formatOrderAutopilotManualCheckNote,
} from "@/lib/admin/autopilotBatch";
import { getEnv } from "@/lib/env";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import { isIndieFundrChainMemoEnabled, buildIndieFundrMemo } from "@/lib/tron/transactionMemo";
import {
  completeOrder,
  ensureInvestmentForCompletedUsdt,
  failOrder,
  resetUsdtAttempt,
} from "@/services/orders/purchaseOrderProcessor";
import { isManualFulfillmentOrder } from "@/services/orders/purchaseOrderManual";
import * as feeSponsorship from "@/services/tron/feeSponsorship";
import * as tron from "@/services/tron/client";
import type { AdminWithdrawalRow } from "@/services/admin/withdrawalOrderFulfillment";
import {
  countSiblingOpenOrders,
  formatSiblingDeferRecoveryReason,
} from "@/services/admin/siblingOpenOrders";

export type AdminOrderRow = {
  orderType: "subscribe";
  orderId: string;
  userId: string;
  userEmail: string;
  userName: string;
  fundId: string;
  fundName: string;
  costUsdt: number;
  reservedUsdt: number;
  status: PurchaseOrderStatus;
  step: PurchaseOrderStep;
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

const OPEN_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.queued,
  PurchaseOrderStatus.processing,
];

/** Wait before retrying TRX top-up after a retryable USDT fuel failure (admin Complete order). */
export const ADMIN_COMPLETE_ORDER_RETRY_WAIT_MS = 60_000;

/** Top-up target = max(estimatedTrx, minEstimatedTrx) × this ratio minus wallet balance. */
export const ADMIN_TRX_TOPUP_BUFFER_RATIO = 1.5;

function logAdminCompleteOrder(
  orderId: string,
  step: string,
  payload: Record<string, unknown> = {}
): void {
  console.log("[admin-complete-order]", { orderId, step, ...payload });
}

export function computeAdminTrxTopUpAmount(
  estimate: { estimatedTrx: number; trxBalance: number },
  minEstimatedTrx = 0
): number {
  const needed = Math.max(estimate.estimatedTrx, minEstimatedTrx);
  const target = parseFloat((needed * ADMIN_TRX_TOPUP_BUFFER_RATIO).toFixed(6));
  return parseFloat(Math.max(0, target - estimate.trxBalance).toFixed(6));
}

export function computeAdminRecoverableTrx({
  sponsoredTrx,
  currentTrxBalance,
  reserveTrx,
  transferFeeTrx = 0,
}: {
  sponsoredTrx: number;
  currentTrxBalance: number;
  reserveTrx: number;
  transferFeeTrx?: number;
}): number {
  if (sponsoredTrx <= 0) return 0;

  const balanceSun = Math.floor(Number(currentTrxBalance) * 1e6);
  const reserveSun = Math.floor(Number(reserveTrx) * 1e6);
  const feeSun = Math.floor(Number(transferFeeTrx) * 1e6);
  const sponsoredSun = Math.floor(Number(sponsoredTrx) * 1e6);
  const maxSweepSun = Math.max(0, balanceSun - reserveSun - feeSun);
  const recoverableSun = Math.min(sponsoredSun, maxSweepSun);
  return recoverableSun / 1e6;
}

const ADMIN_BALANCE_POLL_ATTEMPTS = 3;
const ADMIN_BALANCE_POLL_INTERVAL_MS = 2_000;

async function readStableTrxBalance(address: string): Promise<number> {
  let balance = await tron.getTrxBalance(address);
  for (let attempt = 1; attempt < ADMIN_BALANCE_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) =>
      setTimeout(resolve, ADMIN_BALANCE_POLL_INTERVAL_MS)
    );
    const next = await tron.getTrxBalance(address);
    if (Math.abs(next - balance) < 1e-6) {
      return next;
    }
    balance = next;
  }
  return balance;
}

const ADMIN_SWEEP_RETRY_STEP_SUN = 20_000;
const ADMIN_SWEEP_MAX_ATTEMPTS = 8;

async function broadcastAdminSweepTrx({
  orderId,
  walletPrivateKey,
  walletAddress,
  treasuryAddress,
  initialAmountTrx,
  sponsoredTrx,
  reserveTrx,
}: {
  orderId: string;
  walletPrivateKey: string;
  walletAddress: string;
  treasuryAddress: string;
  initialAmountTrx: number;
  sponsoredTrx: number;
  reserveTrx: number;
}): Promise<Record<string, unknown>> {
  let amountSun = Math.floor(Number(initialAmountTrx) * 1e6);
  let lastError: unknown;

  for (let attempt = 1; attempt <= ADMIN_SWEEP_MAX_ATTEMPTS && amountSun > 0; attempt++) {
    const amountTrx = amountSun / 1e6;
    logAdminCompleteOrder(orderId, "recover_broadcast_attempt", {
      attempt,
      amountTrx,
      amountSun,
    });

    try {
      const signed = await tron.transferTrx({
        fromPrivateKey: walletPrivateKey,
        toAddress: treasuryAddress,
        amountTrx,
      });
      return { ...signed, amountTrx };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!tron.isInsufficientTrxBalanceError(message)) {
        logAdminCompleteOrder(orderId, "recover_broadcast_failed", {
          attempt,
          amountTrx,
          error: message,
        });
        throw error;
      }

      const freshBalance = await readStableTrxBalance(walletAddress);
      const freshFee = await tron.estimateAdminSweepTransferFee(walletAddress);
      const recomputed = computeAdminRecoverableTrx({
        sponsoredTrx,
        currentTrxBalance: freshBalance,
        reserveTrx,
        transferFeeTrx: freshFee.estimatedTrx,
      });
      const recomputedSun = Math.floor(recomputed * 1e6);

      logAdminCompleteOrder(orderId, "recover_broadcast_retry", {
        attempt,
        amountTrx,
        error: message,
        freshBalance,
        freshTransferFeeTrx: freshFee.estimatedTrx,
        retryAmountTrx: recomputed,
        retryAmountSun: recomputedSun,
      });

      if (recomputedSun <= 0) {
        throw error;
      }

      amountSun =
        recomputedSun < amountSun - ADMIN_SWEEP_RETRY_STEP_SUN
          ? recomputedSun
          : Math.max(0, amountSun - ADMIN_SWEEP_RETRY_STEP_SUN);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("TRX sweep broadcast failed after retries");
}

export type AdminFulfillmentEstimate = {
  estimatedTrx: number;
  trxBalance: number;
  shortfall: number;
  hasEnoughTrx: boolean;
  hasEnoughUsdt: boolean;
  costUsdt: number;
};

export type AdminTrxTopUpResult = {
  skipped: boolean;
  txId: string | null;
  amountTrx: number;
  estimatedTrx: number;
  trxBalance: number;
  shortfall: number;
  targetTrx: number;
  bufferRatio: number;
};

export type AdminTransactionStatus = {
  status: "pending" | "success" | "failed";
  message?: string;
  retryable?: boolean;
  feeTrx?: number;
};

export type AdminRecoverTrxResult = {
  skipped: boolean;
  sweepTxId: string | null;
  recoveredTrx: number;
  trxBalance?: number;
  sponsoredTrx?: number;
  recoverableTrx?: number;
  transferFeeTrx?: number;
  reason?: string;
};

export type AdminOrderWalletSnapshot = {
  trxBalance: number;
  usdtBalance: number;
  sponsoredTrx: number;
  trxBefore: number;
  estimatedTrx: number | null;
  usdtTxId: string | null;
  recoverableTrx: number;
  transferFeeTrx: number;
  usdtFeeTrx?: number;
  trxAfterUsdt: number | null;
};

export type AdminTransactionStatusOptions = {
  expectUsdtTransfer?: boolean;
};

export type AdminBroadcastTrxTopUpOptions = {
  minEstimatedTrx?: number;
};

export type AdminResetUsdtForFuelRetryOptions = {
  observedFeeTrx?: number;
};

export function resolveAdminTransactionStatusFromInspection(
  inspection: tron.ChainTxInspection,
  options: AdminTransactionStatusOptions = {}
): AdminTransactionStatus {
  if (inspection.lookupFailed) {
    return { status: "pending" };
  }

  const expectUsdt = options.expectUsdtTransfer === true;

  if (expectUsdt) {
    if (inspection.usdtTransferSuccessful) {
      return { status: "success" };
    }
    if (inspection.status === "pending") {
      return { status: "pending" };
    }
  } else if (inspection.status === "success") {
    return { status: "success" };
  } else if (inspection.status === "pending") {
    return { status: "pending" };
  }

  const failure = tron.parseTransactionFailureReason(inspection.transactionInfo);
  if (!inspection.transactionInfo?.id && failure.code === "PENDING") {
    return { status: "pending" };
  }

  return {
    status: "failed",
    message: failure.message,
    retryable: failure.retryable,
    feeTrx: failure.feeTrx,
  };
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const withStatus = error as { status?: number; response?: { status?: number } };
  if (withStatus.status === 429 || withStatus.response?.status === 429) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    /status code 429/i.test(message) ||
    /failed:\s*429/i.test(message) ||
    /too many requests/i.test(message) ||
    /rate limit/i.test(message)
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (!items.length) return [];
  const bounded = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: bounded }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await mapper(items[index] as T);
      }
    })
  );
  return results;
}

function getTreasuryPrivateKey(): string {
  const pk = getEnv().treasuryPrivateKey?.trim();
  if (!pk) {
    throw new Error("Treasury private key is not configured");
  }
  return pk;
}

async function loadManualOrderForSettlement(orderId: string): Promise<PurchaseOrder> {
  const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new Error("Purchase order not found");
  }
  if (!isManualFulfillmentOrder(order)) {
    throw new Error("Order is not manual fulfillment");
  }
  return order;
}

async function loadManualOrder(orderId: string): Promise<PurchaseOrder> {
  const order = await loadManualOrderForSettlement(orderId);
  if (
    order.status !== PurchaseOrderStatus.queued &&
    order.status !== PurchaseOrderStatus.processing
  ) {
    throw new Error("Order is no longer open");
  }
  return order;
}

export async function listAdminSubscriptionQueue(): Promise<AdminSubscriptionRow[]> {
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
      status: { in: OPEN_STATUSES },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    include: {
      user: { select: { email: true, name: true } },
      wallet: { select: { address: true, privateKey: true } },
    },
  });

  return mapWithConcurrency(
    orders,
    Math.min(getEnv().walletActivityStatusConcurrency, 8),
    async (order) => {
    const fund = getFundById(order.fundId);
    let trxBalance: number | null = null;
    let usdtBalance: number | null = null;
    let balanceReadStatus: AdminOrderRow["balanceReadStatus"] = "ok";

    if (order.wallet?.address && (await tron.validateAddress(order.wallet.address))) {
      try {
        [trxBalance, usdtBalance] = await Promise.all([
          tron.getTrxBalance(order.wallet.address),
          tron.getUsdtBalance(order.wallet.address),
        ]);
      } catch (error) {
        trxBalance = null;
        usdtBalance = null;
        balanceReadStatus = isRateLimitError(error) ? "rate_limited" : "read_failed";
      }
    } else {
      balanceReadStatus = "read_failed";
    }

    const topUpTxId = order.topUpTxId ?? order.adminTrxTopUpTxId;
    const usdtTxId = order.usdtTxId ?? order.adminUsdtTxId;

    return {
      orderType: "subscribe" as const,
      orderId: order.id,
      userId: order.userId,
      userEmail: order.user.email,
      userName: order.user.name,
      fundId: order.fundId,
      fundName: fund?.name ?? order.fundId,
      costUsdt: order.costUsdt,
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
    };
    }
  );
}

export type AdminQueueRow =
  | AdminOrderRow
  | AdminWithdrawalRow
  | import("@/services/admin/referralPayoutOrderFulfillment").AdminReferralPayoutRow;

/** @deprecated Use listAdminOrderQueue */
export async function listAdminOrderQueue(): Promise<AdminQueueRow[]> {
  const { listAdminWithdrawalQueue } = await import(
    "@/services/admin/withdrawalOrderFulfillment"
  );
  const { listAdminReferralPayoutQueue } = await import(
    "@/services/admin/referralPayoutOrderFulfillment"
  );
  const [subscriptions, withdrawals, referrals] = await Promise.all([
    listAdminSubscriptionQueue(),
    listAdminWithdrawalQueue(),
    listAdminReferralPayoutQueue(),
  ]);
  const merged: AdminQueueRow[] = [
    ...subscriptions,
    ...withdrawals,
    ...referrals,
  ];
  merged.sort(
    (a, b) =>
      new Date(a.normalizedDateIso).getTime() -
      new Date(b.normalizedDateIso).getTime()
  );
  return merged;
}

/** @deprecated Use AdminOrderRow */
export type AdminSubscriptionRow = AdminOrderRow;

export async function recordAdminTrxTopUpTx(
  orderId: string,
  txId: string,
  adminEmail: string
): Promise<void> {
  const trimmed = txId.trim();
  if (!trimmed) {
    throw new Error("Transaction id is required");
  }

  const order = await loadManualOrder(orderId);
  const topUpTxIds = (order.topUpTxIds ?? []).includes(trimmed)
    ? order.topUpTxIds
    : [...(order.topUpTxIds ?? []), trimmed];

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      adminTrxTopUpTxId: trimmed,
      topUpTxId: trimmed,
      topUpTxIds,
      status: PurchaseOrderStatus.processing,
      step:
        order.step === PurchaseOrderStep.awaiting_trx
          ? PurchaseOrderStep.awaiting_usdt
          : order.step,
      adminSettledBy: adminEmail,
      updatedAt: new Date(),
    },
  });
}

export async function recordAdminUsdtTx(
  orderId: string,
  txId: string,
  adminEmail?: string,
  broadcastJson?: Record<string, unknown>
): Promise<void> {
  const trimmed = txId.trim();
  if (!trimmed) {
    throw new Error("Transaction id is required");
  }

  const order = await loadManualOrder(orderId);
  const chainMemo = buildIndieFundrMemo({
    kind: "invest",
    fundId: order.fundId,
    entityId: order.id,
  });

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      adminUsdtTxId: trimmed,
      usdtTxId: trimmed,
      chainMemo,
      status: PurchaseOrderStatus.processing,
      step: PurchaseOrderStep.awaiting_review,
      ...(broadcastJson
        ? { usdtBroadcastJson: broadcastJson as object }
        : {}),
      ...(adminEmail ? { adminSettledBy: adminEmail } : {}),
      updatedAt: new Date(),
    },
  });
}

export async function getAdminFulfillmentEstimate(
  orderId: string
): Promise<AdminFulfillmentEstimate> {
  const order = await loadManualOrder(orderId);
  const treasuryAddress = getEnv().treasuryAddress;
  if (!treasuryAddress) {
    throw new Error("Treasury address is not configured");
  }

  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.address) {
    throw new Error("User wallet not found");
  }

  const feeEstimate = await tron.estimateUsdtTransfer({
    fromAddress: wallet.address,
    toAddress: treasuryAddress,
    amount: order.costUsdt,
  });

  const shortfall = feeSponsorship.computeSponsorShortfall(feeEstimate);

  return {
    estimatedTrx: feeEstimate.estimatedTrx,
    trxBalance: feeEstimate.trxBalance,
    shortfall,
    hasEnoughTrx: feeEstimate.hasEnoughTrx,
    hasEnoughUsdt: feeEstimate.hasEnoughUsdt,
    costUsdt: order.costUsdt,
  };
}

export async function broadcastAdminTrxTopUp(
  orderId: string,
  options: AdminBroadcastTrxTopUpOptions = {}
): Promise<AdminTrxTopUpResult> {
  logAdminCompleteOrder(orderId, "trx_topup_start", {
    minEstimatedTrx: options.minEstimatedTrx ?? 0,
  });
  const order = await loadManualOrder(orderId);
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
    toAddress: treasuryAddress,
    amount: order.costUsdt,
  });

  const minEstimatedTrx = options.minEstimatedTrx ?? 0;
  const needed = Math.max(feeEstimate.estimatedTrx, minEstimatedTrx);
  const targetTrx = parseFloat(
    (needed * ADMIN_TRX_TOPUP_BUFFER_RATIO).toFixed(6)
  );
  const amountTrx = computeAdminTrxTopUpAmount(feeEstimate, minEstimatedTrx);
  const shortfall = feeSponsorship.computeSponsorShortfall(feeEstimate);
  const baseResult = {
    estimatedTrx: feeEstimate.estimatedTrx,
    trxBalance: feeEstimate.trxBalance,
    shortfall,
    targetTrx,
    bufferRatio: ADMIN_TRX_TOPUP_BUFFER_RATIO,
  };

  if (amountTrx <= 0) {
    await prisma.purchaseOrder.update({
      where: { id: orderId },
      data: {
        estimatedTrx: needed,
        status: PurchaseOrderStatus.processing,
        step: PurchaseOrderStep.awaiting_usdt,
        updatedAt: new Date(),
      },
    });

    logAdminCompleteOrder(orderId, "trx_topup_skip", {
      estimatedTrx: feeEstimate.estimatedTrx,
      trxBalance: feeEstimate.trxBalance,
      needed,
      targetTrx,
    });

    return {
      ...baseResult,
      shortfall: 0,
      skipped: true,
      txId: null,
      amountTrx: 0,
    };
  }

  const treasuryPk = getTreasuryPrivateKey();

  await feeSponsorship.assertCanSponsor(order.userId, amountTrx, {
    existingSponsoredOnOrder: order.sponsoredTrx || 0,
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

  const topUpTxIds = [...(order.topUpTxIds ?? []), txId];
  const sponsoredTrx = parseFloat(
    ((order.sponsoredTrx || 0) + amountTrx).toFixed(6)
  );

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      topUpTxId: txId,
      adminTrxTopUpTxId: txId,
      topUpTxIds,
      sponsoredTrx,
      sponsorRound: (order.sponsorRound || 0) + 1,
      estimatedTrx: needed,
      trxBefore: feeEstimate.trxBalance,
      status: PurchaseOrderStatus.processing,
      step: PurchaseOrderStep.awaiting_usdt,
      updatedAt: new Date(),
    },
  });

  logAdminCompleteOrder(orderId, "trx_topup_success", {
    txId,
    amountTrx,
    sponsoredTrx,
    trxBefore: feeEstimate.trxBalance,
    estimatedTrx: needed,
    targetTrx,
  });

  return {
    ...baseResult,
    skipped: false,
    txId,
    amountTrx,
  };
}

export async function getAdminTransactionStatus(
  txId: string,
  options: AdminTransactionStatusOptions = {}
): Promise<AdminTransactionStatus> {
  const trimmed = txId.trim();
  if (!trimmed) {
    throw new Error("Transaction id is required");
  }

  const inspection = await tron.inspectTransactionOnChain(trimmed);
  const status = resolveAdminTransactionStatusFromInspection(inspection, options);
  if (status.status !== "pending") {
    logAdminCompleteOrder("", "transaction_status", {
      txId: trimmed,
      status: status.status,
      message: status.message,
      retryable: status.retryable,
      feeTrx: status.feeTrx,
      expectUsdtTransfer: options.expectUsdtTransfer === true,
    });
  }
  return status;
}

export async function resetAdminUsdtForFuelRetry(
  orderId: string,
  options: AdminResetUsdtForFuelRetryOptions = {}
): Promise<void> {
  const order = await loadManualOrder(orderId);
  await resetUsdtAttempt(order);

  const observedFeeTrx = options.observedFeeTrx ?? 0;
  const estimatedTrx =
    observedFeeTrx > 0
      ? Math.max(order.estimatedTrx ?? 0, observedFeeTrx)
      : order.estimatedTrx;

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      adminUsdtTxId: null,
      step: PurchaseOrderStep.awaiting_trx,
      ...(estimatedTrx != null ? { estimatedTrx } : {}),
      updatedAt: new Date(),
    },
  });
}

export async function recordAdminTrxAfterUsdt(orderId: string): Promise<number> {
  logAdminCompleteOrder(orderId, "record_trx_after_usdt_start");
  const order = await loadManualOrder(orderId);
  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.address) {
    throw new Error("User wallet not found");
  }

  const trxBalance = await tron.getTrxBalance(wallet.address);
  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: { trxAfterUsdt: trxBalance, updatedAt: new Date() },
  });
  logAdminCompleteOrder(orderId, "record_trx_after_usdt_success", {
    trxAfterUsdt: trxBalance,
  });
  return trxBalance;
}

export async function getAdminOrderWalletSnapshot(
  orderId: string
): Promise<AdminOrderWalletSnapshot> {
  logAdminCompleteOrder(orderId, "wallet_snapshot_start");
  const order = await loadManualOrder(orderId);
  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.address) {
    throw new Error("User wallet not found");
  }

  const [trxBalance, usdtBalance, transferFee] = await Promise.all([
    tron.getTrxBalance(wallet.address),
    tron.getUsdtBalance(wallet.address),
    tron.estimateAdminSweepTransferFee(wallet.address),
  ]);

  const reserveTrx = getEnv().sponsorTrxReserve;
  const sponsoredTrx = order.sponsoredTrx || 0;
  const transferFeeTrx = transferFee.estimatedTrx;
  const recoverableTrx = computeAdminRecoverableTrx({
    sponsoredTrx,
    currentTrxBalance: trxBalance,
    reserveTrx,
    transferFeeTrx,
  });

  const usdtTxId = order.usdtTxId ?? order.adminUsdtTxId;
  let usdtFeeTrx: number | undefined;
  if (usdtTxId) {
    try {
      const inspection = await tron.inspectTransactionOnChain(usdtTxId);
      const parsed = tron.parseTransactionFailureReason(inspection.transactionInfo);
      if (parsed.feeTrx > 0) {
        usdtFeeTrx = parsed.feeTrx;
      }
    } catch {
      // Optional display field — ignore inspection failures.
    }
  }

  const snapshot = {
    trxBalance,
    usdtBalance,
    sponsoredTrx,
    trxBefore: order.trxBefore || 0,
    estimatedTrx: order.estimatedTrx,
    usdtTxId,
    recoverableTrx,
    transferFeeTrx,
    ...(usdtFeeTrx != null ? { usdtFeeTrx } : {}),
    trxAfterUsdt: order.trxAfterUsdt,
  };

  logAdminCompleteOrder(orderId, "wallet_snapshot_success", {
    trxBalance,
    usdtBalance,
    sponsoredTrx,
    transferFeeTrx,
    recoverableTrx,
    reserveTrx,
    bandwidthAvailable: transferFee.bandwidthAvailable,
  });

  return snapshot;
}

export async function recoverAdminSponsoredTrx(
  orderId: string
): Promise<AdminRecoverTrxResult> {
  logAdminCompleteOrder(orderId, "recover_start");
  const order = await loadManualOrder(orderId);
  const treasuryAddress = getEnv().treasuryAddress;
  if (!treasuryAddress) {
    throw new Error("Treasury address is not configured");
  }

  const siblings = await countSiblingOpenOrders({
    userId: order.userId,
    walletId: order.walletId,
    excludePurchaseOrderId: orderId,
  });
  if (siblings.total > 0) {
    const reason = formatSiblingDeferRecoveryReason(siblings);
    logAdminCompleteOrder(orderId, "recover_skip", {
      reason,
      investmentOrders: siblings.investmentOrders,
      withdrawalOrders: siblings.withdrawalOrders,
    });
    return {
      skipped: true,
      sweepTxId: null,
      recoveredTrx: 0,
      sponsoredTrx: order.sponsoredTrx || 0,
      recoverableTrx: 0,
      reason,
    };
  }

  const sponsoredTrx = order.sponsoredTrx || 0;
  if (sponsoredTrx <= 0) {
    logAdminCompleteOrder(orderId, "recover_skip", {
      reason: "No sponsored TRX to recover",
    });
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
    logAdminCompleteOrder(orderId, "recover_skip", {
      reason: "TRX already recovered",
      sweepTxId: order.sweepTxId,
      recoveredTrx: order.recoveredTrx,
    });
    return {
      skipped: true,
      sweepTxId: order.sweepTxId,
      recoveredTrx: order.recoveredTrx,
      sponsoredTrx,
      recoverableTrx: 0,
      reason: "TRX already recovered",
    };
  }

  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.privateKey || !wallet.address) {
    throw new Error("User wallet not found");
  }

  const reserveTrx = getEnv().sponsorTrxReserve;
  const trxBalance = await readStableTrxBalance(wallet.address);
  const transferFee = await tron.estimateAdminSweepTransferFee(wallet.address);
  const transferFeeTrx = transferFee.estimatedTrx;
  const recoverableTrx = computeAdminRecoverableTrx({
    sponsoredTrx,
    currentTrxBalance: trxBalance,
    reserveTrx,
    transferFeeTrx,
  });

  logAdminCompleteOrder(orderId, "recover_computed", {
    trxBalance,
    reserveTrx,
    transferFeeTrx,
    recoverableTrx,
    sponsoredTrx,
    bandwidthAvailable: transferFee.bandwidthAvailable,
    sweepFeeMode: "conservative_full_bandwidth",
  });

  if (recoverableTrx <= 0) {
    const reason = `Balance ${trxBalance.toFixed(4)} TRX, recoverable 0 TRX (reserve ${reserveTrx} TRX, sweep fee ${transferFeeTrx.toFixed(4)} TRX)`;
    logAdminCompleteOrder(orderId, "recover_skip", { reason });
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

  const signed = await broadcastAdminSweepTrx({
    orderId,
    walletPrivateKey: wallet.privateKey,
    walletAddress: wallet.address,
    treasuryAddress,
    initialAmountTrx: recoverableTrx,
    sponsoredTrx,
    reserveTrx,
  });

  const sweepAmountTrx = Number((signed as { amountTrx?: number }).amountTrx);

  const sweepTxId = tron.getTxId(signed);
  if (!sweepTxId) {
    throw new Error("TRX sweep broadcast missing transaction id");
  }

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      sweepTxId,
      recoveredTrx: sweepAmountTrx,
      updatedAt: new Date(),
    },
  });

  logAdminCompleteOrder(orderId, "recover_success", {
    sweepTxId,
    recoveredTrx: sweepAmountTrx,
    trxBalance,
    transferFeeTrx,
  });

  return {
    skipped: false,
    sweepTxId,
    recoveredTrx: sweepAmountTrx,
    trxBalance,
    sponsoredTrx,
    recoverableTrx: sweepAmountTrx,
    transferFeeTrx,
  };
}

export async function broadcastAdminUsdtPayment(
  orderId: string
): Promise<string> {
  logAdminCompleteOrder(orderId, "usdt_broadcast_start");
  const order = await loadManualOrder(orderId);
  const treasuryAddress = getEnv().treasuryAddress;
  if (!treasuryAddress) {
    throw new Error("Treasury address is not configured");
  }

  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.privateKey) {
    throw new Error("User wallet not found");
  }

  const chainMemo = buildIndieFundrMemo({
    kind: "invest",
    fundId: order.fundId,
    entityId: order.id,
  });

  const signed = await tron.transferUsdt({
    fromPrivateKey: wallet.privateKey,
    toAddress: treasuryAddress,
    amount: order.costUsdt,
    memo: isIndieFundrChainMemoEnabled() ? chainMemo : undefined,
  });

  const txId = tron.getTxId(signed);
  if (!txId) {
    throw new Error("USDT broadcast missing transaction id");
  }

  await recordAdminUsdtTx(orderId, txId, undefined, signed);
  logAdminCompleteOrder(orderId, "usdt_broadcast_success", {
    txId,
    costUsdt: order.costUsdt,
  });
  return txId;
}

export async function markAdminPurchaseOrderSuccess(
  orderId: string,
  adminEmail: string
): Promise<void> {
  let order = await loadManualOrderForSettlement(orderId);

  if (order.status === PurchaseOrderStatus.completed) {
    console.log("[admin] order_mark_success_already_completed", { orderId });
    return;
  }
  if (order.status === PurchaseOrderStatus.failed) {
    throw new Error("Order already marked failed");
  }
  if (
    order.status !== PurchaseOrderStatus.queued &&
    order.status !== PurchaseOrderStatus.processing
  ) {
    throw new Error("Order is no longer open");
  }

  const usdtTxId = order.usdtTxId ?? order.adminUsdtTxId;
  if (!usdtTxId) {
    throw new Error("Record USDT payment tx id before marking successful");
  }

  if (!order.usdtTxId) {
    order = await prisma.purchaseOrder.update({
      where: { id: orderId },
      data: {
        usdtTxId,
        adminUsdtTxId: usdtTxId,
        paymentChainOutcome: "success",
        paymentChainTxId: usdtTxId,
        paymentChainFinal: true,
        updatedAt: new Date(),
      },
    });
  }

  order = await ensureInvestmentForCompletedUsdt(order);
  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      adminSettledAt: new Date(),
      adminSettledBy: adminEmail,
      step: PurchaseOrderStep.awaiting_review,
      updatedAt: new Date(),
    },
  });

  const fresh = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
  if (!fresh) {
    throw new Error("Purchase order not found after prepare");
  }

  await completeOrder(fresh);
}

export async function markAdminPurchaseOrderFailed(
  orderId: string,
  reason: string,
  adminEmail: string
): Promise<void> {
  const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new Error("Purchase order not found");
  }
  if (!isManualFulfillmentOrder(order)) {
    throw new Error("Order is not manual fulfillment");
  }
  if (
    order.status === PurchaseOrderStatus.completed ||
    order.status === PurchaseOrderStatus.failed
  ) {
    throw new Error("Order is already terminal");
  }

  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  const treasuryAddress = getEnv().treasuryAddress ?? undefined;

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      adminSettledAt: new Date(),
      adminSettledBy: adminEmail,
      adminNotes: reason.trim() || order.adminNotes,
      updatedAt: new Date(),
    },
  });

  const fresh = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
  if (!fresh) {
    return;
  }

  await failOrder(
    fresh,
    reason.trim() || "Investment declined by admin",
    {
      wallet: wallet ?? undefined,
      treasuryAddress,
      skipChainGate: true,
    }
  );
}

export async function updateAdminPurchaseOrderNotes(
  orderId: string,
  notes: string
): Promise<void> {
  await loadManualOrder(orderId);
  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: { adminNotes: notes.trim() || null, updatedAt: new Date() },
  });
}

export async function appendAdminOrderAutopilotManualCheckNote(
  orderId: string,
  error: string,
  adminEmail: string
): Promise<void> {
  const order = await loadManualOrder(orderId);
  const line = formatOrderAutopilotManualCheckNote(error);
  const notes = appendAutopilotNote(order.adminNotes, line);
  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      adminNotes: notes,
      adminSettledBy: adminEmail,
      updatedAt: new Date(),
    },
  });
}
