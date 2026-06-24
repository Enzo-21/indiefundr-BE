import {
  InvestmentStatus,
  PurchaseOrderStatus,
  type FailedInvestment,
  type PurchaseOrder,
} from "@prisma/client";
import { buildOrderSettlementView, resolvePurchaseOrderActivityDisplayStatus } from "@/services/orders/orderSettlementView";
import { getFundById } from "@/lib/config/investmentFunds";
import { getPendingPurchaseOrderTapInfo, shouldShowPendingPurchaseOrderTapInfo } from "./walletActivityLabels";
import {
  buildFailedInvestmentActivityWhere,
  buildPurchaseOrderActivityWhere,
  buildWalletActivityWhere,
  getTronscanTxUrl,
} from "@/lib/wallets/helpers";
import { getEnv } from "@/lib/env";
import { shouldSkipInvestmentActivityRow } from "./fundInvestmentActivity";
import { failedOrderCoversFailedInvestment } from "@/lib/wallets/failedInvestmentMatch";
import { prisma } from "@/lib/prisma";
import { tryDeleteRedundantFailedInvestment } from "@/services/orders/purchaseOrderChainMaintenance";
import {
  healPurchaseOrderFromChainTruth,
} from "@/services/orders/purchaseOrderProcessor";
import { isManualFulfillmentOrder } from "@/services/orders/purchaseOrderManual";
import {
  loadTypicalPayoutDaysByFundIds,
  resolveTypicalPayoutDays,
} from "@/services/funds/typicalPayoutDays";
import {
  insightsFromInvestment,
  insightsFromPurchaseOrder,
  insightsFromRedemption,
  type TransactionInsights,
} from "./transactionInsights";
import {
  linksFromInvestment,
  linksFromPurchaseOrder,
  usdtLinks,
} from "./walletOnChainLinks";
import * as tron from "@/services/tron/client";
import {
  buildFundPaymentContext,
  collectPaymentTxIdsFromOrder,
  resolveOrderPaymentOnChain,
  resolvePaymentFromTxIds,
  inspectUsdtPaymentTx,
} from "@/services/tron/usdtPaymentChainTruth";
const RETRY_PENDING_PREFIX = "retry_pending:";

export type AppTransaction = {
  id: string;
  type: "in" | "out";
  source: "app";
  amount: number;
  status: string;
  label: string;
  date: Date;
  txId: string | null;
  tronscanUrl: string | null;
  detail?: string | null;
  pendingTapInfo?: { title: string; message: string } | null;
  displayStatus?: string;
  settlementPhase?: string;
  settlementLabel?: string;
  insights?: TransactionInsights;
  topUpTxId?: string | null;
  topUpTronscanUrl?: string | null;
};

function getPurchaseOrderActivityLink(order: PurchaseOrder) {
  if (order.usdtTxId) {
    return {
      txId: order.usdtTxId,
      tronscanUrl: getTronscanTxUrl(order.usdtTxId),
    };
  }
  return { txId: null, tronscanUrl: null };
}

async function getFailedPurchaseOrderDetail(
  order: PurchaseOrder
): Promise<string | null> {
  const treasury = getEnv().treasuryAddress;
  if (treasury) {
    const resolution = await resolveOrderPaymentOnChain(
      order,
      buildFundPaymentContext(order, treasury)
    );
    if (
      resolution.outcome === "success" ||
      resolution.outcome === "pending" ||
      resolution.outcome === "unknown"
    ) {
      return null;
    }
  }

  const failedAttempts = order.failedUsdtTxIds?.length || 0;
  if (order.usdtTxId) {
    return order.failureReason || "Investment payment did not complete.";
  }
  if (failedAttempts > 0 && order.sponsoredTrx > 0 && order.sweepTxId) {
    return "Network fee assistance was retried but the investment could not complete. Sponsored TRX was returned; your USDT was not sent.";
  }
  if (failedAttempts > 0) {
    return "Network fee assistance was retried after an on-chain fee error. Your USDT was not sent for this investment.";
  }
  if (order.sponsoredTrx > 0 && order.sweepTxId) {
    return "Temporary network fee assistance was returned. Your USDT was not sent for this investment.";
  }
  if (order.sponsoredTrx > 0 && order.topUpTxId) {
    return "Investment did not complete during the network fee step. Your USDT was not sent.";
  }
  return order.failureReason || null;
}

function transactionFromJson(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

/** USDT txIds tied to fund subscribe/redemption — hide duplicate generic chain rows. */
export async function loadKnownFundPaymentTxIds(
  userId: string,
  walletId: string
): Promise<Set<string>> {
  const [orders, investments, failedInvestments] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { userId, walletId },
      select: { usdtTxId: true, failedUsdtTxIds: true },
    }),
    prisma.investment.findMany({
      where: { userId, walletId },
      select: { transaction: true },
    }),
    prisma.failedInvestment.findMany({
      where: { userId, walletId },
      select: { transaction: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const order of orders) {
    for (const txId of collectPaymentTxIdsFromOrder(
      order as PurchaseOrder
    )) {
      ids.add(txId);
    }
  }
  for (const inv of investments) {
    const txId = tron.getTxId(transactionFromJson(inv.transaction));
    if (txId) {
      ids.add(txId);
    }
  }
  for (const item of failedInvestments) {
    const txId = tron.getTxId(transactionFromJson(item.transaction));
    if (txId) {
      ids.add(txId);
    }
  }
  return ids;
}

export async function reconcileOrdersForActivity(
  orders: PurchaseOrder[]
): Promise<number> {
  const candidates = orders.filter(
    (order) =>
      !isManualFulfillmentOrder(order) &&
      (order.status === "failed" || order.status === "processing")
  );
  if (!candidates.length) {
    return 0;
  }

  const concurrency = getEnv().walletActivityStatusConcurrency;
  let healed = 0;

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((order) =>
        healPurchaseOrderFromChainTruth(order).catch(() => false)
      )
    );
    healed += results.filter(Boolean).length;
  }

  return healed;
}

async function shouldShowPurchaseOrderAsFailed(
  order: PurchaseOrder
): Promise<boolean> {
  if (order.status !== "failed") {
    return false;
  }

  const treasury = getEnv().treasuryAddress;
  try {
    const resolution = await resolveOrderPaymentOnChain(
      order,
      treasury ? buildFundPaymentContext(order, treasury) : undefined
    );
    if (
      resolution.outcome === "success" ||
      resolution.outcome === "pending" ||
      resolution.outcome === "unknown"
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function shouldShowFailedInvestment(
  item: FailedInvestment,
  orders: PurchaseOrder[]
): Promise<boolean> {
  const txId = tron.getTxId(transactionFromJson(item.transaction));
  if (!txId) {
    return true;
  }

  const treasury = getEnv().treasuryAddress;
  const resolution = await resolvePaymentFromTxIds(
    [txId],
    inspectUsdtPaymentTx,
    treasury
      ? {
          treasuryAddress: treasury,
          expectedAmountUsdt: item.amountUsdt,
        }
      : undefined
  );

  if (
    resolution.outcome === "success" ||
    resolution.outcome === "pending" ||
    resolution.outcome === "unknown"
  ) {
    const linked = orders.find(
      (order) =>
        order.usdtTxId === txId ||
        (order.failedUsdtTxIds ?? []).includes(txId)
    );
    if (linked) {
      await healPurchaseOrderFromChainTruth(linked).catch(() => false);
    }
    await tryDeleteRedundantFailedInvestment(item, orders).catch(() => false);
    return false;
  }

  return true;
}

export async function buildAppTransactions(
  userId: string,
  walletId: string,
  mainWalletId?: string | null,
  { skipOrderReconcile = false }: { skipOrderReconcile?: boolean } = {}
): Promise<AppTransaction[]> {
  const { markMaturedInvestments } = await import(
    "@/services/investments/maturity"
  );
  await markMaturedInvestments();

  const investmentWhere = buildWalletActivityWhere(
    userId,
    walletId,
    mainWalletId
  );
  const failedWhere = buildFailedInvestmentActivityWhere(
    userId,
    walletId,
    mainWalletId
  );
  const orderWhere = buildPurchaseOrderActivityWhere(
    userId,
    walletId,
    mainWalletId
  );

  const transactions: AppTransaction[] = [];

  const [investments, failed] = await Promise.all([
    prisma.investment.findMany({
      where: investmentWhere,
      orderBy: { date: "desc" },
    }),
    prisma.failedInvestment.findMany({
      where: failedWhere,
      orderBy: { date: "desc" },
    }),
  ]);

  let orders = await prisma.purchaseOrder.findMany({
    where: orderWhere,
    orderBy: { date: "desc" },
  });
  if (!skipOrderReconcile) {
    await reconcileOrdersForActivity(orders);
    orders = await prisma.purchaseOrder.findMany({
      where: orderWhere,
      orderBy: { date: "desc" },
    });
  }

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const deferInvestmentUntilConfirm = getEnv().deferInvestmentUntilConfirm;
  const typicalByFund = await loadTypicalPayoutDaysByFundIds([
    ...investments.map((inv) => inv.fundId),
    ...orders.map((order) => order.fundId),
  ]);

  for (const inv of investments) {
    const linkedOrder = inv.purchaseOrderId
      ? orderById.get(inv.purchaseOrderId)
      : null;
    if (
      inv.status === InvestmentStatus.pending &&
      shouldSkipInvestmentActivityRow(linkedOrder, deferInvestmentUntilConfirm)
    ) {
      continue;
    }

    const fund = getFundById(inv.fundId);
    const fundName = fund?.name || inv.fundId;
    const onChain = linksFromInvestment(inv, linkedOrder);
    let status = "confirmed";
    if (inv.status === InvestmentStatus.failed) {
      status = "failed";
    } else if (inv.status === InvestmentStatus.pending) {
      const linkedOrder = inv.purchaseOrderId
        ? orderById.get(inv.purchaseOrderId)
        : null;
      if (
        linkedOrder?.status === PurchaseOrderStatus.completed ||
        linkedOrder?.paymentChainOutcome === "success"
      ) {
        status = "confirmed";
      } else {
        status = "pending";
      }
    }

    transactions.push({
      id: `investment-${inv.id}`,
      type: "out",
      source: "app",
      amount: inv.amountUsdt,
      status,
      label: `Investment order (${fundName})`,
      date: inv.date,
      txId: onChain.txId,
      tronscanUrl: onChain.tronscanUrl,
      topUpTxId: onChain.topUpTxId,
      topUpTronscanUrl: onChain.topUpTronscanUrl,
      insights: insightsFromInvestment(
        inv,
        fund,
        resolveTypicalPayoutDays(
          inv.fundId,
          fund?.termDays ?? 90,
          typicalByFund
        )
      ),
    });

    if (
      inv.redemptionTransaction &&
      ["redeeming", "redeemed"].includes(inv.status)
    ) {
      const redeemLinks = usdtLinks(
        tron.getTxId(transactionFromJson(inv.redemptionTransaction))
      );
      const redeemStatus = inv.status === "redeemed" ? "confirmed" : "pending";
      const redemptionDate = inv.redeemedAt || inv.date;
      transactions.push({
        id: `redemption-${inv.id}`,
        type: "in",
        source: "app",
        amount: inv.projectedPayoutUsdt,
        status: redeemStatus,
        label: `Earnings credited (${fundName})`,
        date: redemptionDate,
        txId: redeemLinks.txId,
        tronscanUrl: redeemLinks.tronscanUrl,
        topUpTxId: null,
        topUpTronscanUrl: null,
        insights: insightsFromRedemption(
          inv,
          fund,
          inv.projectedPayoutUsdt,
          resolveTypicalPayoutDays(
            inv.fundId,
            fund?.termDays ?? 90,
            typicalByFund
          )
        ),
      });
    }
  }

  const failedOrders = orders.filter((order) => order.status === "failed");

  for (const item of failed) {
    const fund = getFundById(item.fundId);
    const fundName = fund?.name || item.fundId;
    const txId = tron.getTxId(transactionFromJson(item.transaction));
    const coveredByFailedOrder = failedOrders.some((order) =>
      failedOrderCoversFailedInvestment(order, item, txId)
    );
    if (coveredByFailedOrder) {
      continue;
    }

    if (!(await shouldShowFailedInvestment(item, orders))) {
      continue;
    }

    transactions.push({
      id: `failed-investment-${item.id}`,
      type: "out",
      source: "app",
      amount: item.amountUsdt,
      status: "failed",
      label: `Failed investment order (${fundName})`,
      date: item.date,
      txId,
      tronscanUrl: txId ? getTronscanTxUrl(txId) : null,
    });
  }

  const pendingInvestmentIds = new Set(
    investments
      .filter((inv) => {
        if (inv.status !== InvestmentStatus.pending) {
          return false;
        }
        const linked = inv.purchaseOrderId
          ? orderById.get(inv.purchaseOrderId)
          : null;
        if (
          linked?.status === PurchaseOrderStatus.completed ||
          linked?.paymentChainOutcome === "success"
        ) {
          return false;
        }
        return true;
      })
      .map((inv) => String(inv.id))
  );
  const successfulInvestmentDatesByFund = new Map<string, number[]>();
  for (const inv of investments) {
    if (inv.status === "failed" || inv.status === "pending") continue;
    const successAtMs = inv.date.getTime();
    const list = successfulInvestmentDatesByFund.get(inv.fundId) ?? [];
    list.push(successAtMs);
    successfulInvestmentDatesByFund.set(inv.fundId, list);
  }

  for (const order of orders) {
    if (order.status === "completed") {
      continue;
    }

    if (
      order.investmentId &&
      pendingInvestmentIds.has(String(order.investmentId))
    ) {
      continue;
    }

    if (order.status === "failed" && order.investmentId) {
      const linkedInvestment = investments.find(
        (inv) => String(inv.id) === String(order.investmentId)
      );
      if (linkedInvestment) {
        continue;
      }
    }

    const fund = getFundById(order.fundId);
    const fundName = fund?.name || order.fundId;
    const settlement = buildOrderSettlementView(order);
    const linkedInvestment = order.investmentId
      ? investments.find(
          (inv) => String(inv.id) === String(order.investmentId)
        ) ?? null
      : null;
    const displayStatus = resolvePurchaseOrderActivityDisplayStatus(
      order,
      settlement,
      linkedInvestment
    );
    const isFailed =
      displayStatus === "failed" &&
      (await shouldShowPurchaseOrderAsFailed(order));
    const isRetryPendingFailure =
      isFailed && (order.failureReason || "").startsWith(RETRY_PENDING_PREFIX);
    if (isRetryPendingFailure) {
      continue;
    }
    if (isFailed) {
      const successfulDates =
        successfulInvestmentDatesByFund.get(order.fundId) ?? [];
      const failedAtMs = (order.updatedAt || order.date).getTime();
      const hasLaterSuccess = successfulDates.some((ts) => ts > failedAtMs);
      if (hasLaterSuccess) {
        continue;
      }
    }
    const settlementLabel = settlement.settlementLabel;
    const { txId, tronscanUrl } = getPurchaseOrderActivityLink(order);
    const orderOnChain = linksFromPurchaseOrder(order);
    const inFlightPending =
      displayStatus === "pending" && !txId && settlement.phase !== "confirming";
    const isManualReserved =
      isManualFulfillmentOrder(order) &&
      settlement.phase === "reserved" &&
      !txId;
    const activityLabel = isFailed
      ? `Failed investment order (${fundName})`
      : inFlightPending && !isManualReserved
        ? `Investment order (${fundName}) — ${settlementLabel}`
        : `Investment order (${fundName})`;
    const pendingTapInfo = shouldShowPendingPurchaseOrderTapInfo(
      order,
      displayStatus,
      settlement.phase
    )
      ? getPendingPurchaseOrderTapInfo(order, fundName)
      : null;

    transactions.push({
      id: `purchase-order-${order.id}`,
      type: "out",
      source: "app",
      amount: order.costUsdt,
      status: displayStatus,
      label: activityLabel,
      detail: isFailed ? await getFailedPurchaseOrderDetail(order) : null,
      date: order.updatedAt || order.date,
      txId: txId ?? orderOnChain.txId,
      tronscanUrl: tronscanUrl ?? orderOnChain.tronscanUrl,
      topUpTxId: orderOnChain.topUpTxId,
      topUpTronscanUrl: orderOnChain.topUpTronscanUrl,
      pendingTapInfo,
      displayStatus,
      settlementPhase: settlement.phase,
      settlementLabel,
      insights: insightsFromPurchaseOrder(
        order,
        fund,
        linkedInvestment,
        resolveTypicalPayoutDays(
          order.fundId,
          fund?.termDays ?? 90,
          typicalByFund
        )
      ),
    });
  }

  return transactions;
}
