import {
  InvestmentStatus,
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  PurchaseOrderStep,
  type PurchaseOrder,
  type Wallet,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  getFundById,
  getMaturityDate,
  projectedPayoutUsdt,
} from "@/lib/config/pricing";
import { getEnv } from "@/lib/env";
import {
  buildIndieFundrMemo,
  isIndieFundrChainMemoEnabled,
} from "@/lib/tron/transactionMemo";
import { fieldIsNullOrUnset } from "@/lib/prisma/mongoFieldFilters";
import { prisma } from "@/lib/prisma";
import {
  createInvestmentIfSlotAvailable,
  getInvestmentSlotUsage,
  InvestmentSlotsFullError,
} from "@/lib/config/investmentSlots";
import { sendPushNotification } from "@/services/orders/pushNotify";
import { onSubscribeCompleted } from "@/services/revenueEngine/onSubscribeCompleted";
import { applyPendingReferralCode } from "@/services/referrals/applyPendingReferralCode";
import { releaseDeferredReferralRewardsOnInviterFirstInvestment } from "@/services/referrals/referralRewardEngine";
import * as feeSponsorship from "@/services/tron/feeSponsorship";
import * as tron from "@/services/tron/client";
import { cleanupRedundantFailedInvestments } from "@/services/orders/purchaseOrderChainMaintenance";
import {
  buildFundPaymentContext,
  resolveOrderPaymentOnChain,
} from "@/services/tron/usdtPaymentChainTruth";
import {
  persistOrderPaymentChainState,
  refreshOrderPaymentChainState,
} from "@/services/wallets/paymentChainState";
import { refreshWalletActivityForOrder } from "@/services/wallets/walletActivityRefresh";
import {
  gateOrderBeforeFail,
  orderHasPaymentAttempt,
} from "@/services/orders/orderSettlementView";
import { settlementTraceLog } from "@/lib/settlementTraceLog";
import {
  ensureWalletActivated,
  recordWalletActivatedIfOnChain,
} from "@/services/tron/walletActivation";
import { isValidObjectId } from "@/lib/validators/objectId";
import { getWalletUsdtAvailability } from "@/services/wallets/walletBalance";
import {
  automaticFulfillmentOrderFilter,
  isManualFulfillmentOrder,
} from "@/services/orders/purchaseOrderManual";

/** Automatic PO processor disabled — subscriptions are admin-fulfilled only. */
const PURCHASE_ORDER_PROCESSOR_ENABLED = false;
const PURCHASE_ORDER_RECONCILE_LIMIT = 20;
const PURCHASE_ORDER_RECONCILE_MAX_PER_RUN = 50;
const PURCHASE_ORDER_RECONCILE_MAX_ROUNDS = 3;
const PURCHASE_ORDER_HEAL_ENABLED = false;
const PURCHASE_ORDER_HEAL_MAX_PER_RUN = 50;

type WalletWithKey = Wallet & { privateKey: string };
export const RETRY_PENDING_PREFIX = "retry_pending:";

const orderProcessingLocks = new Map<string, Promise<void>>();

async function withOrderLock(
  orderId: string,
  fn: () => Promise<void>
): Promise<void> {
  const prev = orderProcessingLocks.get(orderId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  orderProcessingLocks.set(
    orderId,
    prev.then(() => next)
  );
  await prev;
  try {
    await fn();
  } finally {
    release();
    if (orderProcessingLocks.get(orderId) === next) {
      orderProcessingLocks.delete(orderId);
    }
  }
}

function getTreasuryAddress(): string {
  return getEnv().treasuryAddress;
}

function getTreasuryPrivateKey(): string {
  return getEnv().treasuryPrivateKey;
}

async function logOrderTronState(
  order: PurchaseOrder,
  context: string,
  txIds: { usdtTxId?: string | null; topUpTxId?: string | null },
  extra?: Record<string, unknown>
): Promise<void> {
  if (!getEnv().purchaseOrderTronDebug) {
    return;
  }

  const base = {
    orderId: order.id,
    status: order.status,
    step: order.step,
    investmentId: order.investmentId,
    ...extra,
  };

  if (txIds.usdtTxId) {
    const inspection = await tron.inspectTransactionOnChain(txIds.usdtTxId);
    tron.logTronTransactionInspection(context, inspection, {
      ...base,
      txKind: "usdt",
    });
  }

  if (txIds.topUpTxId) {
    const inspection = await tron.inspectTransactionOnChain(txIds.topUpTxId);
    tron.logTronTransactionInspection(context, inspection, {
      ...base,
      txKind: "topUp",
    });
  }
}

export async function failOrder(
  order: PurchaseOrder,
  reason: string,
  {
    wallet,
    treasuryAddress,
    skipChainGate = false,
  }: {
    wallet?: WalletWithKey | null;
    treasuryAddress?: string;
    skipChainGate?: boolean;
  } = {}
): Promise<boolean> {
  if (order.fulfillmentMode === PurchaseOrderFulfillmentMode.manual) {
    skipChainGate = true;
  }

  if (orderHasPaymentAttempt(order)) {
    const gate = await gateOrderBeforeFail(order);
    if (gate.action === "heal") {
      const fresh = await prisma.purchaseOrder.findUnique({
        where: { id: order.id },
      });
      if (fresh) {
        await healPurchaseOrderFromChainTruth(fresh);
      }
      return false;
    }
    if (gate.action === "wait") {
      await prisma.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status: PurchaseOrderStatus.processing,
          step: PurchaseOrderStep.usdt_confirm,
          failureReason: null,
          updatedAt: new Date(),
        },
      });
      settlementTraceLog("failOrder_deferred", {
        orderId: order.id,
        reason,
        outcome: gate.resolution.outcome,
        skipChainGate,
      });
      return false;
    }
  }

  const paymentTxId =
    order.usdtTxId ?? order.failedUsdtTxIds?.at(-1) ?? undefined;

  const paymentChainFinal = orderHasPaymentAttempt(order) ? false : true;

  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      status: PurchaseOrderStatus.failed,
      failureReason: reason,
      step: PurchaseOrderStep.done,
      investmentId: null,
      paymentChainOutcome: "failed",
      paymentChainTxId: paymentTxId,
      paymentChainCheckedAt: new Date(),
      paymentChainFinal,
      updatedAt: new Date(),
    },
  });

  if (order.sponsoredTrx > 0 && wallet && treasuryAddress) {
    await feeSponsorship.recoverSponsoredTrxFromOrder({
      userWallet: wallet,
      treasuryAddress,
      order,
    });
  }

  if (order.investmentId) {
    const investment = await prisma.investment.findUnique({
      where: { id: order.investmentId },
    });
    if (investment) {
      await prisma.failedInvestment.create({
        data: {
          userId: investment.userId,
          walletId: investment.walletId,
          fundId: investment.fundId,
          amountUsdt: investment.amountUsdt,
          ...(investment.transaction != null
            ? { transaction: investment.transaction }
            : {}),
        },
      });
      await prisma.investment.delete({ where: { id: investment.id } });
    }
  }

  await sendPushNotification(order.device, "Investment failed", reason, {
    type: "SUBSCRIBE_FUND_ERROR",
  });

  console.warn("[purchaseOrder] failed", { orderId: order.id, reason });

  const failedOrder = await prisma.purchaseOrder.findUnique({
    where: { id: order.id },
  });
  if (failedOrder) {
    await refreshWalletActivityForOrder(failedOrder).catch((err) => {
      console.error(
        "[wallet:activity] refresh after failOrder failed",
        order.id,
        err instanceof Error ? err.message : err
      );
    });
  }
  return true;
}

function isRetryPendingOrder(order: PurchaseOrder): boolean {
  return (order.failureReason || "").startsWith(RETRY_PENDING_PREFIX);
}

async function markOrderRetryPending(
  order: PurchaseOrder,
  reason: string,
  step: PurchaseOrderStep = PurchaseOrderStep.validate
): Promise<void> {
  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      status: PurchaseOrderStatus.processing,
      step,
      failureReason: `${RETRY_PENDING_PREFIX}${reason}`,
      updatedAt: new Date(),
    },
  });
  console.warn("[purchaseOrder] retry pending", {
    orderId: order.id,
    reason,
    step,
  });
}

/** Move failed top-up tx id into history and clear active pointer so a new broadcast can proceed. */
export async function clearFailedTopUpTxRecord(
  order: PurchaseOrder
): Promise<PurchaseOrder> {
  const txId = order.topUpTxId;
  if (!txId) {
    return order;
  }
  const topUpTxIds = (order.topUpTxIds ?? []).includes(txId)
    ? order.topUpTxIds
    : [...(order.topUpTxIds ?? []), txId];

  return prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      topUpTxId: null,
      topUpTxIds,
      step: PurchaseOrderStep.trx_topup,
      updatedAt: new Date(),
    },
  });
}

type ReconcileStaleTopUpResult =
  | { action: "none" }
  | { action: "pending"; order: PurchaseOrder }
  | { action: "cleared_failed"; order: PurchaseOrder }
  | { action: "advanced_success"; order: PurchaseOrder };

async function reconcileStaleTopUpTx(
  order: PurchaseOrder
): Promise<ReconcileStaleTopUpResult> {
  if (!order.topUpTxId) {
    return { action: "none" };
  }

  const inspection = await tron.inspectTransactionOnChain(order.topUpTxId);
  tron.logTronTransactionInspection("reconcileStaleTopUpTx", inspection, {
    orderId: order.id,
    status: order.status,
    step: order.step,
    txKind: "topUp",
  });

  if (inspection.status === "pending") {
    if (order.step !== PurchaseOrderStep.trx_confirm) {
      const updated = await prisma.purchaseOrder.update({
        where: { id: order.id },
        data: {
          step: PurchaseOrderStep.trx_confirm,
          updatedAt: new Date(),
        },
      });
      return { action: "pending", order: updated };
    }
    return { action: "pending", order };
  }

  if (inspection.status === "failed") {
    const updated = await clearFailedTopUpTxRecord(order);
    return { action: "cleared_failed", order: updated };
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      step: PurchaseOrderStep.usdt_transfer,
      failureReason: null,
      updatedAt: new Date(),
    },
  });
  return { action: "advanced_success", order: updated };
}

function isTrxSponsorRoundCapReached(order: PurchaseOrder): boolean {
  return (order.sponsorRound || 0) >= getEnv().treasuryTrxTopUpMaxRounds;
}

export { isTrxSponsorRoundCapReached };

export async function completeOrder(order: PurchaseOrder): Promise<void> {
  if (!order.investmentId) {
    if (orderHasPaymentAttempt(order)) {
      const withInvestment = await ensureInvestmentForCompletedUsdt(order);
      return completeOrder(withInvestment);
    }
    await failOrder(order, "Investment record missing after payment", {
      skipChainGate: true,
    });
    return;
  }

  const investment = await prisma.investment.findUnique({
    where: { id: order.investmentId },
  });
  if (!investment) {
    if (orderHasPaymentAttempt(order)) {
      const cleared = await prisma.purchaseOrder.update({
        where: { id: order.id },
        data: { investmentId: null, updatedAt: new Date() },
      });
      const withInvestment = await ensureInvestmentForCompletedUsdt(cleared);
      return completeOrder(withInvestment);
    }
    await failOrder(order, "Investment record missing after payment", {
      skipChainGate: true,
    });
    return;
  }

  const fund = getFundById(order.fundId);
  if (!fund) {
    await failOrder(order, `Unknown fund: ${order.fundId}`, { skipChainGate: true });
    return;
  }

  const subscribedAt = new Date();

  const updatedInvestment = await prisma.investment.update({
    where: { id: investment.id },
    data: {
      status: InvestmentStatus.active,
      subscribedAt,
      maturesAt: getMaturityDate(subscribedAt),
      returnPercent90d: fund.returnPercent90d,
      projectedPayoutUsdt: projectedPayoutUsdt(
        investment.amountUsdt,
        fund.returnPercent90d
      ),
    },
  });

  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      status: PurchaseOrderStatus.completed,
      step: PurchaseOrderStep.done,
      paymentChainOutcome: "success",
      paymentChainTxId: order.usdtTxId ?? undefined,
      paymentChainCheckedAt: new Date(),
      paymentChainFinal: true,
      updatedAt: new Date(),
    },
  });

  try {
    await onSubscribeCompleted(updatedInvestment);
  } catch (engineErr) {
    const message =
      engineErr instanceof Error ? engineErr.message : String(engineErr);
    console.error("[revenueEngine] onSubscribeCompleted failed:", message);
    if (order.fulfillmentMode === PurchaseOrderFulfillmentMode.manual) {
      throw new Error(
        `Investment completed but treasury subscribe inflow failed: ${message}`
      );
    }
  }

  try {
    await applyPendingReferralCode(updatedInvestment.userId, updatedInvestment.id);
  } catch (referralErr) {
    const message =
      referralErr instanceof Error ? referralErr.message : String(referralErr);
    console.error("[referral] applyPendingReferralCode failed:", message);
  }

  try {
    await releaseDeferredReferralRewardsOnInviterFirstInvestment(
      updatedInvestment.userId,
      updatedInvestment.id
    );
  } catch (referralErr) {
    const message =
      referralErr instanceof Error ? referralErr.message : String(referralErr);
    console.error(
      "[referral] releaseDeferredReferralRewardsOnInviterFirstInvestment failed:",
      message
    );
  }

  const fundName = fund?.name || order.fundId;

  await sendPushNotification(
    order.device,
    "Investment confirmed",
    `Your position in ${fundName} is now active for 90 days.`,
    { type: "SUBSCRIBE_FUND_SUCCESS" }
  );

  console.log("[purchaseOrder] completed", {
    orderId: order.id,
    investmentId: investment.id,
    fundId: order.fundId,
  });

  const completedOrder = await prisma.purchaseOrder.findUnique({
    where: { id: order.id },
  });
  if (completedOrder) {
    await refreshWalletActivityForOrder(completedOrder).catch((err) => {
      console.error(
        "[wallet:activity] refresh after completeOrder failed",
        order.id,
        err instanceof Error ? err.message : err
      );
    });
  }
}

export async function resetUsdtAttempt(order: PurchaseOrder): Promise<PurchaseOrder> {
  if (order.investmentId) {
    await prisma.investment.delete({ where: { id: order.investmentId } }).catch(
      () => undefined
    );
  }

  const failedUsdtTxIds = [...(order.failedUsdtTxIds || [])];
  if (order.usdtTxId) {
    failedUsdtTxIds.push(order.usdtTxId);
  }

  return prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      investmentId: null,
      usdtTxId: null,
      failedUsdtTxIds,
      updatedAt: new Date(),
    },
  });
}

async function scheduleFeeSponsorshipRetry(
  order: PurchaseOrder,
  wallet: WalletWithKey,
  treasuryPk: string,
  treasuryAddress: string,
  { minEstimatedTrx }: { minEstimatedTrx?: number } = {}
): Promise<void> {
  let feeEstimate: tron.UsdtTransferEstimate;
  try {
    feeEstimate = await tron.estimateUsdtTransfer({
      fromAddress: wallet.address,
      toAddress: treasuryAddress,
      amount: order.costUsdt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failOrder(order, message, {
      wallet,
      treasuryAddress,
      skipChainGate: true,
    });
    return;
  }

  const estimatedNeeded = minEstimatedTrx
    ? Math.max(feeEstimate.estimatedTrx, minEstimatedTrx)
    : feeEstimate.estimatedTrx;
  const effectiveEstimate = { ...feeEstimate, estimatedTrx: estimatedNeeded };

  if (effectiveEstimate.trxBalance >= estimatedNeeded) {
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        step: PurchaseOrderStep.usdt_transfer,
        estimatedTrx: estimatedNeeded,
        updatedAt: new Date(),
      },
    });
    return processPurchaseOrder(order.id);
  }

  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      step: PurchaseOrderStep.trx_topup,
      estimatedTrx: estimatedNeeded,
      updatedAt: new Date(),
    },
  });

  const refreshed = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: order.id },
  });
  return processTrxTopUp(
    refreshed,
    wallet,
    treasuryPk,
    treasuryAddress,
    effectiveEstimate
  );
}

export async function handleUsdtFailure(
  order: PurchaseOrder,
  wallet: WalletWithKey,
  treasuryAddress: string,
  treasuryPk: string,
  txId: string | null,
  { broadcastError }: { broadcastError?: string } = {}
): Promise<void> {
  const env = getEnv();

  if (!env.feeSponsorshipEnabled) {
    const reason =
      broadcastError ||
      (txId ? (await tron.getTransactionFailureReason(txId)).message : null) ||
      "USDT payment failed on-chain";
    await failOrder(order, reason, { wallet, treasuryAddress });
    return;
  }

  let failure: tron.TransactionFailureReason = {
    retryable: false,
    code: "FAILED",
    feeTrx: 0,
    message: "USDT payment failed on-chain",
  };
  if (txId) {
    failure = await tron.getTransactionFailureReason(txId);
  } else if (
    broadcastError &&
    tron.isRetryableFeeBroadcastError(broadcastError)
  ) {
    failure = { retryable: true, code: "BROADCAST", feeTrx: 0, message: broadcastError };
  }

  if (!failure.retryable) {
    await failOrder(order, failure.message || "USDT payment failed on-chain", {
      wallet,
      treasuryAddress,
    });
    return;
  }

  const resetOrder = await resetUsdtAttempt(order);

  console.log("[purchaseOrder] retrying after fee failure", {
    orderId: order.id,
    sponsorRound: resetOrder.sponsorRound,
    failedTxId: txId,
    observedFeeTrx: failure.feeTrx,
  });

  return scheduleFeeSponsorshipRetry(
    resetOrder,
    wallet,
    treasuryPk,
    treasuryAddress,
    {
      minEstimatedTrx: failure.feeTrx > 0 ? failure.feeTrx : undefined,
    }
  );
}

async function processTrxTopUp(
  order: PurchaseOrder,
  wallet: WalletWithKey,
  treasuryPk: string,
  treasuryAddress: string,
  feeEstimate: tron.UsdtTransferEstimate
): Promise<void> {
  const env = getEnv();

  if (feeEstimate.hasEnoughTrx) {
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        step: PurchaseOrderStep.usdt_transfer,
        updatedAt: new Date(),
      },
    });
    return processPurchaseOrder(order.id);
  }

  if (!env.feeSponsorshipEnabled) {
    await markOrderRetryPending(
      order,
      "Not enough TRX for network fees",
      PurchaseOrderStep.trx_topup
    );
    return;
  }

  const shortfall = feeSponsorship.computeSponsorShortfall(feeEstimate);
  if (shortfall <= 0) {
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        step: PurchaseOrderStep.usdt_transfer,
        updatedAt: new Date(),
      },
    });
    return processPurchaseOrder(order.id);
  }

  const currentRound = order.sponsorRound || 0;
  const sponsorAmount = parseFloat(shortfall.toFixed(6));

  try {
    await feeSponsorship.assertCanSponsor(order.userId, sponsorAmount, {
      existingSponsoredOnOrder: order.sponsoredTrx || 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markOrderRetryPending(order, message, PurchaseOrderStep.trx_topup);
    return;
  }

  let fresh = await prisma.purchaseOrder.findUnique({ where: { id: order.id } });
  if (!fresh) {
    return;
  }
  if (fresh.topUpTxId || fresh.step === PurchaseOrderStep.trx_confirm) {
    const reconciled = await reconcileStaleTopUpTx(fresh);
    if (reconciled.action === "advanced_success") {
      return processPurchaseOrder(order.id);
    }
    if (reconciled.action === "pending" || reconciled.action === "none") {
      return;
    }
    fresh = reconciled.order;
  }

  if (isTrxSponsorRoundCapReached(fresh)) {
    await failOrder(fresh, "Network fee sponsorship failed after multiple attempts", {
      skipChainGate: true,
    });
    return;
  }

  const claim = await prisma.purchaseOrder.updateMany({
    where: {
      AND: [
        { id: order.id },
        fieldIsNullOrUnset("topUpTxId"),
        { status: PurchaseOrderStatus.processing },
        {
          step: {
            in: [PurchaseOrderStep.validate, PurchaseOrderStep.trx_topup],
          },
        },
      ],
    },
    data: {
      step: PurchaseOrderStep.trx_confirm,
      updatedAt: new Date(),
    },
  });
  if (claim.count !== 1) {
    return;
  }

  const trxBefore =
    currentRound === 0 ? feeEstimate.trxBalance : fresh.trxBefore;

  const topUp = await tron.transferTrx({
    fromPrivateKey: treasuryPk,
    toAddress: wallet.address,
    amountTrx: sponsorAmount,
  });
  const txId = tron.getTxId(topUp);
  if (!txId) {
    await markOrderRetryPending(
      order,
      "TRX top-up broadcast missing transaction id",
      PurchaseOrderStep.trx_topup
    );
    return;
  }

  const topUpTxIds = [...(fresh.topUpTxIds || []), txId];
  const sponsoredTrx = parseFloat(
    ((fresh.sponsoredTrx || 0) + sponsorAmount).toFixed(6)
  );

  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      trxBefore,
      estimatedTrx: feeEstimate.estimatedTrx,
      topUpTxId: txId,
      topUpTxIds,
      sponsoredTrx,
      sponsorRound: currentRound + 1,
      step: PurchaseOrderStep.trx_confirm,
      updatedAt: new Date(),
    },
  });

  console.log("[purchaseOrder] TRX top-up broadcast", {
    orderId: order.id,
    round: currentRound + 1,
    amountTrx: sponsorAmount,
    cumulativeSponsoredTrx: sponsoredTrx,
    topUpTxId: txId,
  });

  await recordWalletActivatedIfOnChain(wallet);
  return processPurchaseOrder(order.id);
}

async function processTrxConfirm(
  order: PurchaseOrder,
  wallet: WalletWithKey,
  treasuryAddress: string
): Promise<void> {
  if (!order.topUpTxId) {
    await markOrderRetryPending(
      order,
      "TRX top-up transaction missing",
      PurchaseOrderStep.trx_topup
    );
    return;
  }

  const topUpInspection = await tron.inspectTransactionOnChain(order.topUpTxId);
  tron.logTronTransactionInspection("processTrxConfirm", topUpInspection, {
    orderId: order.id,
    status: order.status,
    step: order.step,
    investmentId: order.investmentId,
    txKind: "topUp",
  });
  const status = topUpInspection.status;
  if (status === "pending") {
    return;
  }
  if (status === "failed") {
    await clearFailedTopUpTxRecord(order);
    await markOrderRetryPending(
      order,
      "TRX top-up failed on-chain",
      PurchaseOrderStep.trx_topup
    );
    return;
  }

  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      step: PurchaseOrderStep.usdt_transfer,
      updatedAt: new Date(),
    },
  });
  return processPurchaseOrder(order.id);
}

async function processUsdtTransfer(
  order: PurchaseOrder,
  wallet: WalletWithKey,
  treasuryAddress: string
): Promise<void> {
  if (order.investmentId && order.usdtTxId) {
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        step: PurchaseOrderStep.usdt_confirm,
        updatedAt: new Date(),
      },
    });
    return processPurchaseOrder(order.id);
  }

  const availability = await getWalletUsdtAvailability(wallet, {
    excludeOrderId: order.id,
  });
  if (availability.availableUsdt < order.costUsdt) {
    await failOrder(order, "Insufficient USDT to complete investment", {
      wallet,
      treasuryAddress,
      skipChainGate: true,
    });
    return;
  }

  const chainMemo = buildIndieFundrMemo({
    kind: "invest",
    fundId: order.fundId,
    entityId: order.id,
  });

  let signedTransaction: Record<string, unknown>;
  try {
    signedTransaction = await tron.transferUsdt({
      fromPrivateKey: wallet.privateKey,
      toAddress: treasuryAddress,
      amount: order.costUsdt,
      memo: isIndieFundrChainMemoEnabled() ? chainMemo : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const treasuryPk = getTreasuryPrivateKey();
    if (tron.isRetryableFeeBroadcastError(message)) {
      return handleUsdtFailure(order, wallet, treasuryAddress, treasuryPk, null, {
        broadcastError: message,
      });
    }
    await failOrder(order, message || "USDT transfer failed", {
      wallet,
      treasuryAddress,
      skipChainGate: true,
    });
    return;
  }

  const usdtTxId = tron.getTxId(signedTransaction);
  if (!usdtTxId) {
    await markOrderRetryPending(
      order,
      "USDT transfer missing transaction id",
      PurchaseOrderStep.usdt_transfer
    );
    return;
  }

  const fund = getFundById(order.fundId);
  if (!fund) {
    await failOrder(order, `Unknown fund: ${order.fundId}`, {
      wallet,
      treasuryAddress,
      skipChainGate: true,
    });
    return;
  }

  const existingForOrder = await findInvestmentForPurchaseOrder(order.id);
  if (existingForOrder) {
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        usdtTxId,
        chainMemo,
        usdtBroadcastJson: signedTransaction as Prisma.InputJsonValue,
        investmentId: existingForOrder.id,
        step: PurchaseOrderStep.usdt_confirm,
        updatedAt: new Date(),
      },
    });
    console.log("[purchaseOrder] USDT broadcast (existing investment)", {
      orderId: order.id,
      usdtTxId,
      investmentId: existingForOrder.id,
    });
    settlementTraceLog("usdt_broadcast", {
      orderId: order.id,
      usdtTxId,
      deferredInvestment: getEnv().deferInvestmentUntilConfirm,
    });
    return processPurchaseOrder(order.id);
  }

  if (getEnv().deferInvestmentUntilConfirm) {
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        usdtTxId,
        chainMemo,
        usdtBroadcastJson: signedTransaction as Prisma.InputJsonValue,
        step: PurchaseOrderStep.usdt_confirm,
        updatedAt: new Date(),
      },
    });
    console.log("[purchaseOrder] USDT broadcast (deferred investment)", {
      orderId: order.id,
      usdtTxId,
    });
    settlementTraceLog("usdt_broadcast", {
      orderId: order.id,
      usdtTxId,
      deferredInvestment: true,
    });
    return processPurchaseOrder(order.id);
  }

  let newInvestment;
  try {
    newInvestment = await createInvestmentIfSlotAvailable({
      userId: order.userId,
      walletId: order.walletId,
      fundId: order.fundId,
      amountUsdt: order.costUsdt,
      returnPercent90d: fund.returnPercent90d,
      projectedPayoutUsdt: projectedPayoutUsdt(
        order.costUsdt,
        fund.returnPercent90d
      ),
      status: InvestmentStatus.pending,
      purchaseOrderId: order.id,
      transaction: signedTransaction as Prisma.InputJsonValue,
    });
  } catch (err) {
    if (err instanceof InvestmentSlotsFullError) {
      await failOrder(order, err.message, {
        wallet,
        treasuryAddress,
        skipChainGate: true,
      });
      return;
    }
    throw err;
  }

  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      usdtTxId,
      chainMemo,
      investmentId: newInvestment.id,
      step: PurchaseOrderStep.usdt_confirm,
      updatedAt: new Date(),
    },
  });

  console.log("[purchaseOrder] USDT broadcast", { orderId: order.id, usdtTxId });
  settlementTraceLog("usdt_broadcast", {
    orderId: order.id,
    usdtTxId,
    deferredInvestment: false,
  });
  return processPurchaseOrder(order.id);
}

async function processUsdtConfirm(
  order: PurchaseOrder,
  wallet: WalletWithKey,
  treasuryAddress: string
): Promise<void> {
  if (!order.usdtTxId && !orderHasPaymentAttempt(order)) {
    await failOrder(order, "USDT transaction missing", {
      wallet,
      treasuryAddress,
      skipChainGate: true,
    });
    return;
  }

  const resolution = await refreshOrderPaymentChainState(order);

  settlementTraceLog("usdt_confirm", {
    orderId: order.id,
    usdtTxId: order.usdtTxId,
    outcome: resolution.outcome,
    winningTxId: resolution.winningTxId ?? null,
  });

  if (resolution.outcome === "success" && resolution.winningTxId) {
    if (order.usdtTxId !== resolution.winningTxId) {
      await prisma.purchaseOrder.update({
        where: { id: order.id },
        data: {
          usdtTxId: resolution.winningTxId,
          updatedAt: new Date(),
        },
      });
    }
    const fresh = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    await finalizePurchaseOrderIfUsdtSucceededOnChain(fresh);
    return;
  }

  if (resolution.outcome === "pending" || resolution.outcome === "unknown") {
    return;
  }

  const treasuryPk = getTreasuryPrivateKey();
  return handleUsdtFailure(
    order,
    wallet,
    treasuryAddress,
    treasuryPk,
    order.usdtTxId
  );
}

export async function processPurchaseOrder(orderId: string): Promise<void> {
  return withOrderLock(orderId, async () => {
    await processPurchaseOrderUnlocked(orderId);
  });
}

async function processPurchaseOrderUnlocked(orderId: string): Promise<void> {
  if (!PURCHASE_ORDER_PROCESSOR_ENABLED) {
    return;
  }

  const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
  if (
    !order ||
    order.status === PurchaseOrderStatus.completed ||
    order.status === PurchaseOrderStatus.failed
  ) {
    return;
  }
  if (order.fulfillmentMode === PurchaseOrderFulfillmentMode.manual) {
    return;
  }

  const wallet = await prisma.wallet.findUnique({
    where: { id: order.walletId },
  });
  const treasuryAddress = getTreasuryAddress();
  const treasuryPk = getTreasuryPrivateKey();

  if (!wallet?.privateKey || !treasuryAddress) {
    await failOrder(order, "Wallet or treasury not configured", {
      skipChainGate: true,
    });
    return;
  }

  const walletWithKey = wallet as WalletWithKey;

  if (isRetryPendingOrder(order)) {
    const retryDelayMs = getEnv().treasuryTrxTopUpWaitMs;
    if (Date.now() - order.updatedAt.getTime() < retryDelayMs) {
      return;
    }
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        failureReason: null,
        updatedAt: new Date(),
      },
    });
  }

  const activation = await ensureWalletActivated(walletWithKey);
  if (activation.status === "failed") {
    console.warn("[purchaseOrder] wallet activation failed", {
      orderId: order.id,
      error: activation.error,
    });
  }
  await recordWalletActivatedIfOnChain(walletWithKey);

  let currentOrder = order;

  if (currentOrder.status === PurchaseOrderStatus.queued) {
    const slotUsage = await getInvestmentSlotUsage(
      currentOrder.userId,
      currentOrder.fundId
    );
    if (slotUsage.slotsAvailable <= 0) {
      await failOrder(
        currentOrder,
        `Maximum open investments reached for this fund (${slotUsage.openCount}/${slotUsage.maxOpenInvestments})`,
        {
          wallet: walletWithKey,
          treasuryAddress,
          skipChainGate: true,
        }
      );
      return;
    }

    const availability = await getWalletUsdtAvailability(walletWithKey, {
      excludeOrderId: currentOrder.id,
    });
    if (availability.availableUsdt < currentOrder.costUsdt) {
      await failOrder(currentOrder, "Insufficient USDT available", {
        wallet: walletWithKey,
        treasuryAddress,
        skipChainGate: true,
      });
      return;
    }

    currentOrder = await prisma.purchaseOrder.update({
      where: { id: currentOrder.id },
      data: {
        status: PurchaseOrderStatus.processing,
        step: PurchaseOrderStep.validate,
        updatedAt: new Date(),
      },
    });
  }

  let feeEstimate: tron.UsdtTransferEstimate;
  try {
    feeEstimate = await tron.estimateUsdtTransfer({
      fromAddress: walletWithKey.address,
      toAddress: treasuryAddress,
      amount: currentOrder.costUsdt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failOrder(currentOrder, message, {
      wallet: walletWithKey,
      treasuryAddress,
      skipChainGate: true,
    });
    return;
  }

  if (!currentOrder.estimatedTrx) {
    currentOrder = await prisma.purchaseOrder.update({
      where: { id: currentOrder.id },
      data: {
        estimatedTrx: feeEstimate.estimatedTrx,
        updatedAt: new Date(),
      },
    });
  }

  const step = currentOrder.step;

  if (step === PurchaseOrderStep.validate || step === PurchaseOrderStep.trx_topup) {
    const effectiveEstimate =
      currentOrder.estimatedTrx &&
      currentOrder.estimatedTrx > feeEstimate.estimatedTrx
        ? { ...feeEstimate, estimatedTrx: currentOrder.estimatedTrx }
        : feeEstimate;
    await processTrxTopUp(
      currentOrder,
      walletWithKey,
      treasuryPk,
      treasuryAddress,
      effectiveEstimate
    );
    return;
  }

  if (step === PurchaseOrderStep.trx_confirm) {
    await processTrxConfirm(currentOrder, walletWithKey, treasuryAddress);
    return;
  }

  if (step === PurchaseOrderStep.usdt_transfer) {
    await processUsdtTransfer(currentOrder, walletWithKey, treasuryAddress);
    return;
  }

  if (step === PurchaseOrderStep.usdt_confirm) {
    await processUsdtConfirm(currentOrder, walletWithKey, treasuryAddress);
    return;
  }
}

async function findInvestmentForPurchaseOrder(orderId: string) {
  return prisma.investment.findFirst({
    where: { purchaseOrderId: orderId },
    orderBy: { date: "desc" },
  });
}

export async function ensureInvestmentForCompletedUsdt(
  order: PurchaseOrder
): Promise<PurchaseOrder> {
  if (order.investmentId) {
    const existing = await prisma.investment.findUnique({
      where: { id: order.investmentId },
    });
    if (existing) {
      return order;
    }
    order = await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { investmentId: null, updatedAt: new Date() },
    });
  }

  const existingForOrder = await findInvestmentForPurchaseOrder(order.id);
  if (existingForOrder) {
    return prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        investmentId: existingForOrder.id,
        status: PurchaseOrderStatus.processing,
        step: PurchaseOrderStep.usdt_confirm,
        failureReason: null,
        updatedAt: new Date(),
      },
    });
  }

  const fund = getFundById(order.fundId);
  if (!fund) {
    throw new Error(`Unknown fund: ${order.fundId}`);
  }

  const failedCandidates = await prisma.failedInvestment.findMany({
    where: {
      userId: order.userId,
      walletId: order.walletId,
      fundId: order.fundId,
      amountUsdt: order.costUsdt,
    },
    orderBy: { date: "desc" },
    take: 10,
  });

  const paymentTxId = order.usdtTxId;
  let failedRecord =
    paymentTxId != null
      ? failedCandidates.find((row) => {
          const tx = row.transaction as Record<string, unknown> | null;
          return tron.getTxId(tx) === paymentTxId;
        }) ?? null
      : null;

  if (!failedRecord) {
    failedRecord = failedCandidates[0] ?? null;
  }

  let investment;
  try {
    investment = await createInvestmentIfSlotAvailable({
      userId: order.userId,
      walletId: order.walletId,
      fundId: order.fundId,
      amountUsdt: order.costUsdt,
      returnPercent90d: fund.returnPercent90d,
      projectedPayoutUsdt: projectedPayoutUsdt(
        order.costUsdt,
        fund.returnPercent90d
      ),
      status: InvestmentStatus.pending,
      purchaseOrderId: order.id,
      ...(order.usdtBroadcastJson != null
        ? { transaction: order.usdtBroadcastJson }
        : failedRecord?.transaction != null
          ? { transaction: failedRecord.transaction }
          : {}),
    });
  } catch (err) {
    if (err instanceof InvestmentSlotsFullError) {
      throw new Error(err.message);
    }
    throw err;
  }

  if (failedRecord) {
    await prisma.failedInvestment.deleteMany({ where: { id: failedRecord.id } });
  }

  return prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      investmentId: investment.id,
      status: PurchaseOrderStatus.processing,
      step: PurchaseOrderStep.usdt_confirm,
      failureReason: null,
      updatedAt: new Date(),
    },
  });
}

function reconcileCandidateWhere(
  userId?: string,
  walletId?: string
): Prisma.PurchaseOrderWhereInput {
  return {
    paymentChainFinal: false,
    status: {
      in: [PurchaseOrderStatus.processing, PurchaseOrderStatus.failed],
    },
    OR: [
      { usdtTxId: { not: null } },
      { failedUsdtTxIds: { isEmpty: false } },
    ],
    ...(userId ? { userId } : {}),
    ...(walletId ? { walletId } : {}),
  };
}

function falselyFinalizedFailedReconcileWhere(
  userId?: string,
  walletId?: string
): Prisma.PurchaseOrderWhereInput {
  return {
    status: PurchaseOrderStatus.failed,
    paymentChainFinal: true,
    paymentChainOutcome: "failed",
    OR: [
      { usdtTxId: { not: null } },
      { failedUsdtTxIds: { isEmpty: false } },
    ],
    ...(userId ? { userId } : {}),
    ...(walletId ? { walletId } : {}),
  };
}

/** Heal order when any linked USDT payment tx succeeded on-chain. */
export async function healPurchaseOrderFromChainTruth(
  order: PurchaseOrder
): Promise<boolean> {
  if (order.status === PurchaseOrderStatus.completed) {
    if (!order.paymentChainFinal) {
      await persistOrderPaymentChainState(
        order.id,
        {
          outcome: "success",
          winningTxId: order.usdtTxId ?? undefined,
        },
        PurchaseOrderStatus.completed
      );
    }
    return true;
  }
  if (isManualFulfillmentOrder(order)) {
    return false;
  }
  if (!isValidObjectId(order.id)) {
    return false;
  }

  const forceRefresh =
    order.status === PurchaseOrderStatus.failed &&
    order.paymentChainFinal &&
    order.paymentChainOutcome === "failed" &&
    orderHasPaymentAttempt(order);

  const resolution = await refreshOrderPaymentChainState(order, {
    forceRefresh,
  });

  if (resolution.outcome !== "success" || !resolution.winningTxId) {
    return false;
  }

  let fresh = order;
  if (fresh.usdtTxId !== resolution.winningTxId) {
    fresh = await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        usdtTxId: resolution.winningTxId,
        updatedAt: new Date(),
      },
    });
    const inspection = await tron.inspectTransactionOnChain(
      resolution.winningTxId
    );
    tron.logTronTransactionInspection(
      "healPurchaseOrderFromChainTruth",
      inspection,
      {
        orderId: order.id,
        winningTxId: resolution.winningTxId,
      }
    );
  }

  if (fresh.status === PurchaseOrderStatus.failed) {
    fresh = await prisma.purchaseOrder.update({
      where: { id: fresh.id },
      data: {
        status: PurchaseOrderStatus.processing,
        step: PurchaseOrderStep.usdt_confirm,
        failureReason: null,
        updatedAt: new Date(),
      },
    });
  }

  try {
    const withInvestment = await ensureInvestmentForCompletedUsdt(fresh);
    await completeOrder(withInvestment);
    console.log("[purchaseOrder] chain_truth_healed", {
      orderId: order.id,
      usdtTxId: resolution.winningTxId,
      priorStatus: order.status,
    });
    const healedOrder = await prisma.purchaseOrder.findUnique({
      where: { id: order.id },
    });
    if (healedOrder) {
      await refreshWalletActivityForOrder(healedOrder).catch((err) => {
        console.error(
          "[wallet:activity] refresh after chain heal failed",
          order.id,
          err instanceof Error ? err.message : err
        );
      });
    }
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: PurchaseOrderStatus.processing,
        step: PurchaseOrderStep.usdt_confirm,
        failureReason: `chain_heal_pending:${message}`,
        updatedAt: new Date(),
      },
    });
    console.error("[purchaseOrder] chain_truth_heal_error", order.id, message);
    return false;
  }
}

/** Complete order when USDT payment already succeeded on-chain. */
export async function finalizePurchaseOrderIfUsdtSucceededOnChain(
  order: PurchaseOrder
): Promise<boolean> {
  return healPurchaseOrderFromChainTruth(order);
}

export async function reconcilePurchaseOrderIdsOnChain(
  orderIds: string[]
): Promise<number> {
  if (!orderIds.length) {
    return 0;
  }
  const orders = await prisma.purchaseOrder.findMany({
    where: { id: { in: orderIds } },
  });
  let reconciled = 0;
  for (const order of orders) {
    try {
      if (await healPurchaseOrderFromChainTruth(order)) {
        reconciled += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[purchaseOrder] priority reconcile error", order.id, message);
    }
  }
  return reconciled;
}

export async function reconcileOnChainSuccessfulUsdtPayments({
  limit,
  userId,
  walletId,
  maxPerRun,
  orderIds,
}: {
  limit?: number;
  userId?: string;
  walletId?: string;
  maxPerRun?: number;
  orderIds?: string[];
} = {}): Promise<number> {
  if (orderIds?.length) {
    return reconcilePurchaseOrderIdsOnChain(orderIds);
  }

  const batchLimit = limit ?? PURCHASE_ORDER_RECONCILE_LIMIT;
  const cap = maxPerRun ?? PURCHASE_ORDER_RECONCILE_MAX_PER_RUN;
  let reconciled = 0;
  let lastId: string | null = null;
  let stagnantBatches = 0;

  while (reconciled < cap) {
    const orders: PurchaseOrder[] = await prisma.purchaseOrder.findMany({
      where: {
        ...automaticFulfillmentOrderFilter(),
        OR: [
          {
            ...reconcileCandidateWhere(userId, walletId),
            ...(lastId ? { id: { gt: lastId } } : {}),
          },
          {
            ...falselyFinalizedFailedReconcileWhere(userId, walletId),
            ...(lastId ? { id: { gt: lastId } } : {}),
          },
        ],
      },
      orderBy: [{ status: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
      take: batchLimit,
    });

    if (!orders.length) {
      break;
    }

    let batchHealed = 0;
    for (const order of orders) {
      lastId = order.id;
      try {
        await logOrderTronState(order, "reconcileOnChainSuccessfulUsdtPayments", {
          usdtTxId: order.usdtTxId,
        });
        if (await healPurchaseOrderFromChainTruth(order)) {
          batchHealed += 1;
          reconciled += 1;
          console.log("[purchaseOrder] reconciled on-chain USDT success", {
            orderId: order.id,
            usdtTxId: order.usdtTxId,
            priorStatus: order.status,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[purchaseOrder] on-chain reconcile error", order.id, message);
      }
      if (reconciled >= cap) {
        break;
      }
    }

    if (batchHealed === 0) {
      stagnantBatches += 1;
      if (stagnantBatches >= 2) {
        break;
      }
    } else {
      stagnantBatches = 0;
    }
  }

  return reconciled;
}

/** Heal processing/failed orders whose USDT tx succeeded on-chain (batched rounds). */
export async function reconcileFailedOrdersWithUsdtTx({
  limit,
  maxRounds,
  userId,
  walletId,
}: {
  limit?: number;
  maxRounds?: number;
  userId?: string;
  walletId?: string;
} = {}): Promise<number> {
  if (!PURCHASE_ORDER_PROCESSOR_ENABLED) {
    return 0;
  }

  const batchLimit = limit ?? PURCHASE_ORDER_RECONCILE_LIMIT;
  const rounds = maxRounds ?? PURCHASE_ORDER_RECONCILE_MAX_ROUNDS;
  let totalReconciled = 0;

  const maxPerRun = PURCHASE_ORDER_RECONCILE_MAX_PER_RUN;
  for (let round = 0; round < rounds; round++) {
    const reconciled = await reconcileOnChainSuccessfulUsdtPayments({
      limit: batchLimit,
      userId,
      walletId,
      maxPerRun: Math.max(1, Math.floor(maxPerRun / rounds)),
    });
    totalReconciled += reconciled;
    if (reconciled === 0) {
      break;
    }
  }

  return totalReconciled;
}

export async function reconcileAllMisclassifiedPurchaseOrders(): Promise<number> {
  const reconciled = await reconcileOnChainSuccessfulUsdtPayments({
    maxPerRun: PURCHASE_ORDER_RECONCILE_MAX_PER_RUN,
  });
  await cleanupRedundantFailedInvestments({
    limit: Math.min(20, getEnv().failedInvestmentCleanupLimit),
  });
  return reconciled;
}

/** Purchase orders that may disagree with on-chain payment truth. */
export function stalePurchaseOrderCandidateWhere(): Prisma.PurchaseOrderWhereInput {
  return {
    ...automaticFulfillmentOrderFilter(),
    OR: [
      {
        status: {
          in: [PurchaseOrderStatus.processing, PurchaseOrderStatus.failed],
        },
      },
      { paymentChainFinal: false },
      {
        status: PurchaseOrderStatus.failed,
        paymentChainFinal: true,
        paymentChainOutcome: "failed",
        usdtTxId: { not: null },
      },
    ],
  };
}

export type ScheduledPurchaseOrderHealResult = {
  candidates: number;
  healed: number;
  batchReconciled: number;
  deletedFailedInvestments: number;
};

/**
 * Bounded heal pass for cron and optional CLI (`npm run heal:purchase-orders`).
 * Broader candidates than paginated reconcile; drains backlog over multiple runs.
 */
export async function runScheduledPurchaseOrderHeal({
  maxPerRun,
}: { maxPerRun?: number } = {}): Promise<ScheduledPurchaseOrderHealResult> {
  const empty: ScheduledPurchaseOrderHealResult = {
    candidates: 0,
    healed: 0,
    batchReconciled: 0,
    deletedFailedInvestments: 0,
  };

  if (!PURCHASE_ORDER_HEAL_ENABLED) {
    return empty;
  }

  const take = maxPerRun ?? PURCHASE_ORDER_HEAL_MAX_PER_RUN;

  const candidates = await prisma.purchaseOrder.findMany({
    where: stalePurchaseOrderCandidateWhere(),
    orderBy: { updatedAt: "desc" },
    take,
  });

  let healed = 0;
  for (const order of candidates) {
    try {
      if (await healPurchaseOrderFromChainTruth(order)) {
        healed += 1;
        console.log("[purchaseOrder] scheduled heal", { orderId: order.id });
      }
    } catch (error) {
      console.error(
        "[purchaseOrder] scheduled heal error",
        order.id,
        error instanceof Error ? error.message : error
      );
    }
  }

  const batchReconciled = await reconcileAllMisclassifiedPurchaseOrders();
  const { deleted } = await cleanupRedundantFailedInvestments({
    limit: getEnv().failedInvestmentCleanupLimit,
  });

  return {
    candidates: candidates.length,
    healed,
    batchReconciled,
    deletedFailedInvestments: deleted,
  };
}

/** CLI / ops: run scheduled heal until no candidates remain (unbounded). */
export async function runScheduledPurchaseOrderHealAll(): Promise<ScheduledPurchaseOrderHealResult> {
  const totals: ScheduledPurchaseOrderHealResult = {
    candidates: 0,
    healed: 0,
    batchReconciled: 0,
    deletedFailedInvestments: 0,
  };

  for (let round = 0; round < 500; round++) {
    const result = await runScheduledPurchaseOrderHeal();
    totals.candidates += result.candidates;
    totals.healed += result.healed;
    totals.batchReconciled += result.batchReconciled;
    totals.deletedFailedInvestments += result.deletedFailedInvestments;
    if (result.candidates === 0) {
      break;
    }
  }

  return totals;
}

export async function reconcileWalletPurchaseOrdersOnChain(
  userId: string,
  walletId: string,
  {
    limit,
    maxRounds,
  }: { limit?: number; maxRounds?: number } = {}
): Promise<number> {
  return reconcileFailedOrdersWithUsdtTx({
    userId,
    walletId,
    limit,
    maxRounds,
  });
}

export async function healMisclassifiedUsdtPaymentFailures({
  limit,
  maxRounds,
}: { limit?: number; maxRounds?: number } = {}): Promise<number> {
  return reconcileFailedOrdersWithUsdtTx({ limit, maxRounds });
}

export async function healMisclassifiedTrxTopUpFailures({
  limit = 5,
}: { limit?: number } = {}): Promise<number> {
  let healed = 0;

  const terminalMisclassified = await prisma.purchaseOrder.findMany({
    where: {
      AND: [
        { status: PurchaseOrderStatus.failed },
        { failureReason: "TRX top-up failed on-chain" },
        { topUpTxId: { not: null } },
        fieldIsNullOrUnset("usdtTxId"),
        fieldIsNullOrUnset("investmentId"),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  for (const order of terminalMisclassified) {
    if (!order.topUpTxId) continue;
    const topUpStatus = await tron.getTransactionStatus(order.topUpTxId);
    if (topUpStatus !== "success") {
      continue;
    }

    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: PurchaseOrderStatus.processing,
        failureReason: null,
        step: PurchaseOrderStep.validate,
        updatedAt: new Date(),
      },
    });
    healed += 1;
    console.log("[purchaseOrder] healed false TRX top-up failure", {
      orderId: order.id,
      topUpTxId: order.topUpTxId,
    });

    try {
      await processPurchaseOrder(order.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[purchaseOrder] heal resume error", order.id, message);
    }
  }

  const stuckProcessing = await prisma.purchaseOrder.findMany({
    where: {
      status: PurchaseOrderStatus.processing,
      topUpTxId: { not: null },
      usdtTxId: null,
      step: {
        in: [
          PurchaseOrderStep.validate,
          PurchaseOrderStep.trx_topup,
          PurchaseOrderStep.trx_confirm,
        ],
      },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  for (const order of stuckProcessing) {
    const reconciled = await reconcileStaleTopUpTx(order);
    if (
      reconciled.action !== "cleared_failed" &&
      reconciled.action !== "advanced_success"
    ) {
      continue;
    }

    healed += 1;
    console.log("[purchaseOrder] healed stuck TRX top-up", {
      orderId: order.id,
      action: reconciled.action,
      priorTopUpTxId: order.topUpTxId,
    });

    try {
      await processPurchaseOrder(order.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[purchaseOrder] stuck top-up heal resume error", order.id, message);
    }
  }

  return healed;
}

/** Remove duplicate pending investments after a completed order, or finish activation. */
export async function healOrphanPendingInvestments({
  limit = 20,
  userId,
}: { limit?: number; userId?: string } = {}): Promise<number> {
  const pending = await prisma.investment.findMany({
    where: {
      status: InvestmentStatus.pending,
      purchaseOrderId: { not: null },
      ...(userId ? { userId } : {}),
    },
    orderBy: { date: "asc" },
    take: limit,
  });

  let healed = 0;
  for (const inv of pending) {
    if (!inv.purchaseOrderId) continue;
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: inv.purchaseOrderId },
    });
    if (!order) continue;

    if (order.status !== PurchaseOrderStatus.completed) {
      continue;
    }

    if (order.investmentId && order.investmentId !== inv.id) {
      const canonical = await prisma.investment.findUnique({
        where: { id: order.investmentId },
      });
      if (canonical && canonical.status !== InvestmentStatus.pending) {
        await prisma.investment.delete({ where: { id: inv.id } });
        healed += 1;
        console.log("[purchaseOrder] removed orphan pending investment", {
          orphanId: inv.id,
          orderId: order.id,
          canonicalId: order.investmentId,
        });
      }
      continue;
    }

    if (order.investmentId === inv.id) {
      await completeOrder(order);
      healed += 1;
      console.log("[purchaseOrder] activated pending investment for completed order", {
        investmentId: inv.id,
        orderId: order.id,
      });
    }
  }

  return healed;
}

/** Advance in-flight purchase orders for a wallet (user poll / activity read). */
export async function processActivePurchaseOrdersForWallet(
  userId: string,
  walletId: string,
  { limit = 3 }: { limit?: number } = {}
): Promise<number> {
  if (!PURCHASE_ORDER_PROCESSOR_ENABLED) {
    return 0;
  }

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      userId,
      walletId,
      fulfillmentMode: PurchaseOrderFulfillmentMode.automatic,
      status: {
        in: [PurchaseOrderStatus.queued, PurchaseOrderStatus.processing],
      },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  for (const order of orders) {
    try {
      await processPurchaseOrder(order.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        "[purchaseOrder] wallet tick error",
        order.id,
        message
      );
    }
  }

  return orders.length;
}

export async function processPendingPurchaseOrders({
  limit,
}: { limit?: number } = {}): Promise<string> {
  if (!PURCHASE_ORDER_PROCESSOR_ENABLED) {
    return "Purchase order processor disabled";
  }

  const batchLimit = limit ?? PURCHASE_ORDER_RECONCILE_LIMIT;
  const orphansHealed = await healOrphanPendingInvestments({ limit: batchLimit });
  const reconciledBefore = await reconcileFailedOrdersWithUsdtTx({
    limit: batchLimit,
  });

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      fulfillmentMode: PurchaseOrderFulfillmentMode.automatic,
      status: {
        in: [PurchaseOrderStatus.queued, PurchaseOrderStatus.processing],
      },
    },
    orderBy: { updatedAt: "asc" },
    take: batchLimit,
  });

  for (const order of orders) {
    try {
      await processPurchaseOrder(order.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[purchaseOrder] processor error", order.id, message);
    }
  }

  const healedTrx = await healMisclassifiedTrxTopUpFailures();
  const reconciledAfter = await reconcileFailedOrdersWithUsdtTx({
    limit: batchLimit,
  });

  const reconciled = reconciledBefore + reconciledAfter;
  const parts = [`Purchase orders processed: ${orders.length}`];
  if (reconciled) {
    parts.push(`reconciled: ${reconciled}`);
  }
  if (healedTrx) {
    parts.push(`trx healed: ${healedTrx}`);
  }
  if (orphansHealed) {
    parts.push(`orphans healed: ${orphansHealed}`);
  }
  return parts.join(", ");
}
