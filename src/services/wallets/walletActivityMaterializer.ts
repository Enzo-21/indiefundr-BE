import type {
  FailedInvestment,
  PurchaseOrder,
  WithdrawalOrder,
} from "@prisma/client";
import { WithdrawalOrderStatus } from "@prisma/client";
import { buildWithdrawalOrderSettlementView } from "@/services/orders/withdrawalOrderSettlementView";
import { Prisma } from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import { APP_NAME } from "@/lib/constants/appBranding";
import {
  buildFailedInvestmentActivityWhere,
  buildPurchaseOrderActivityWhere,
  buildWalletActivityWhere,
  getTronscanTxUrl,
} from "@/lib/wallets/helpers";
import { failedOrderCoversFailedInvestment } from "@/lib/wallets/failedInvestmentMatch";
import { getEnv } from "@/lib/env";
import { deriveOrderSettlementPhaseFromDb } from "@/services/orders/orderSettlementView";
import { prisma } from "@/lib/prisma";
import { REFERRAL_WALLET_ACTIVITY_KINDS } from "@/services/referrals/referralWalletActivity";
import * as tron from "@/services/tron/client";
import type { WalletActivityTx } from "./walletActivityMerge";
import type { TransactionInsights } from "./transactionInsights";
import {
  linksFromInvestment,
  linksFromPurchaseOrder,
  usdtLinks,
  type WalletOnChainLinks,
} from "./walletOnChainLinks";

const RETRY_PENDING_PREFIX = "retry_pending:";
const FUND_ACTIVITY_KINDS = new Set([
  "investment",
  "purchase_order",
  "failed_investment",
  "redemption",
]);

function fundKindPriority(kind: string): number {
  if (kind === "investment") return 3;
  if (kind === "purchase_order") return 2;
  if (kind === "redemption") return 2;
  if (kind === "failed_investment") return 1;
  return 0;
}

/** One fund-related row per txId+direction; prefer investment over purchase_order. */
export function dedupeFundActivityRows(rows: MaterializedRow[]): MaterializedRow[] {
  const byTxKey = new Map<string, MaterializedRow>();
  const passthrough: MaterializedRow[] = [];

  for (const row of rows) {
    if (!row.txId || !FUND_ACTIVITY_KINDS.has(row.kind)) {
      passthrough.push(row);
      continue;
    }
    const key = `${row.txId}:${row.type}`;
    const existing = byTxKey.get(key);
    if (!existing || fundKindPriority(row.kind) > fundKindPriority(existing.kind)) {
      byTxKey.set(key, row);
    }
  }

  return [...byTxKey.values(), ...passthrough];
}

type MaterializedRow = {
  kind: string;
  entityId: string | null;
  txId: string | null;
  type: "in" | "out";
  amountUsdt: number;
  status: string;
  label: string;
  detail?: string | null;
  occurredAt: Date;
  tronscanUrl: string | null;
  chainFinal: boolean;
  pendingTapInfo?: { title: string; message: string } | null;
  displayStatus?: string;
  settlementPhase?: string;
  settlementLabel?: string;
};

function transactionFromJson(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function appendWithdrawalActivityRow(
  rows: MaterializedRow[],
  order: WithdrawalOrder
) {
  const settlement = buildWithdrawalOrderSettlementView(order);
  const txId = order.usdtTxId ?? order.adminUsdtTxId;
  const tronscanUrl = txId ? getTronscanTxUrl(txId) : null;

  if (order.status === WithdrawalOrderStatus.completed) {
    rows.push({
      kind: "withdrawal",
      entityId: order.id,
      txId,
      type: "out",
      amountUsdt: order.amountUsdt,
      status: "confirmed",
      label: "Withdrawal",
      detail: order.destinationAddress,
      occurredAt: order.updatedAt || order.date,
      tronscanUrl,
      chainFinal: true,
      displayStatus: settlement.displayStatus,
      settlementPhase: settlement.phase,
      settlementLabel: settlement.settlementLabel,
    });
    return;
  }

  if (order.status === WithdrawalOrderStatus.failed) {
    rows.push({
      kind: "withdrawal_order",
      entityId: order.id,
      txId,
      type: "out",
      amountUsdt: order.amountUsdt,
      status: "failed",
      label: "Withdrawal order",
      detail: order.failureReason ?? order.destinationAddress,
      occurredAt: order.updatedAt || order.date,
      tronscanUrl,
      chainFinal: true,
      displayStatus: settlement.displayStatus,
      settlementPhase: settlement.phase,
      settlementLabel: settlement.settlementLabel,
    });
    return;
  }

  rows.push({
    kind: "withdrawal_order",
    entityId: order.id,
    txId,
    type: "out",
    amountUsdt: order.amountUsdt,
    status: "pending",
    label: "Withdrawal order",
    detail: order.destinationAddress,
    occurredAt: order.date,
    tronscanUrl,
    chainFinal: false,
    displayStatus: settlement.displayStatus,
    settlementPhase: settlement.phase,
    settlementLabel: settlement.settlementLabel,
    pendingTapInfo: {
      title: "Withdrawal processing",
      message:
        `${APP_NAME} will send your USDT to the destination address after review. ` +
        "You can open this activity again once the transfer is on TronScan.",
    },
  });
}

function getPurchaseOrderActivityLink(order: PurchaseOrder) {
  if (order.usdtTxId) {
    return {
      txId: order.usdtTxId,
      tronscanUrl: getTronscanTxUrl(order.usdtTxId),
    };
  }
  return { txId: null, tronscanUrl: null };
}

function getPendingPurchaseOrderTapInfo(order: PurchaseOrder, fundName: string) {
  if (order.usdtTxId) {
    return null;
  }
  if (order.topUpTxId || (order.sponsoredTrx && order.sponsoredTrx > 0)) {
    return {
      title: "Preparing network fees",
      message:
        `${APP_NAME} is covering Tron network fees for your ${fundName} investment. ` +
        "This step uses a small TRX transfer on your wallet — it is not your USDT payment. " +
        "Once your USDT is sent, you can tap this activity again to view that payment on TronScan.",
    };
  }
  return {
    title: "Investment processing",
    message:
      `Your ${fundName} investment is being set up. ` +
      "You will be able to view the USDT payment on TronScan once it is broadcast.",
  };
}

function getFailedPurchaseOrderDetail(order: PurchaseOrder): string | null {
  const outcome = order.paymentChainOutcome;
  if (
    outcome === "success" ||
    outcome === "pending" ||
    outcome === "unknown"
  ) {
    return null;
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

export function shouldShowPurchaseOrderAsFailed(order: PurchaseOrder): boolean {
  if (order.status !== "failed") {
    return false;
  }
  return order.paymentChainOutcome === "failed";
}

function shouldShowFailedInvestment(
  item: FailedInvestment,
  orders: PurchaseOrder[],
  txId: string | null
): boolean {
  if (!txId) {
    return false;
  }
  const linked = orders.find(
    (order) =>
      order.usdtTxId === txId || (order.failedUsdtTxIds ?? []).includes(txId)
  );
  if (!linked) {
    return false;
  }
  return linked.paymentChainOutcome === "failed";
}

function shouldSkipFailedInvestmentRow(
  inv: { fundId: string; transaction: unknown },
  investments: Array<{ fundId: string; status: string; transaction: unknown }>,
  txId: string | null
): boolean {
  if (!txId) {
    return false;
  }
  return investments.some((other) => {
    if (other.status === "failed") {
      return false;
    }
    if (other.fundId !== inv.fundId) {
      return false;
    }
    return tron.getTxId(transactionFromJson(other.transaction)) === txId;
  });
}

export async function buildMaterializedActivityRows(
  userId: string,
  walletId: string,
  mainWalletId?: string | null
): Promise<MaterializedRow[]> {
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

  const rows: MaterializedRow[] = [];

  const [investments, orders, withdrawalOrders, failed, chainTransfers] =
    await Promise.all([
    prisma.investment.findMany({
      where: investmentWhere,
      orderBy: { date: "desc" },
    }),
    prisma.purchaseOrder.findMany({
      where: orderWhere,
      orderBy: { date: "desc" },
    }),
    prisma.withdrawalOrder.findMany({
      where: { userId, walletId },
      orderBy: { date: "desc" },
    }),
    prisma.failedInvestment.findMany({
      where: failedWhere,
      orderBy: { date: "desc" },
    }),
    prisma.walletChainTransfer.findMany({
      where: { walletId },
      orderBy: { chainDate: "desc" },
      take: 200,
    }),
  ]);

  const investmentsById = new Map(investments.map((inv) => [String(inv.id), inv]));
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const fundPaymentTxIds = new Set<string>();
  for (const order of orders) {
    if (order.usdtTxId) {
      fundPaymentTxIds.add(order.usdtTxId);
    }
    for (const id of order.failedUsdtTxIds ?? []) {
      fundPaymentTxIds.add(id);
    }
  }
  for (const inv of investments) {
    const txId = tron.getTxId(transactionFromJson(inv.transaction));
    if (txId) {
      fundPaymentTxIds.add(txId);
    }
  }
  for (const wOrder of withdrawalOrders) {
    const payTx = wOrder.usdtTxId ?? wOrder.adminUsdtTxId;
    if (payTx) {
      fundPaymentTxIds.add(payTx);
    }
  }

  for (const wOrder of withdrawalOrders) {
    appendWithdrawalActivityRow(rows, wOrder);
  }

  for (const inv of investments) {
    const fund = getFundById(inv.fundId);
    const fundName = fund?.name || inv.fundId;
    const linkedOrder = inv.purchaseOrderId
      ? orderById.get(inv.purchaseOrderId)
      : null;
    const onChain = linksFromInvestment(inv, linkedOrder);
    const txId = onChain.txId;
    let status = "confirmed";
    if (inv.status === "pending") status = "pending";
    if (inv.status === "failed") status = "failed";

    if (inv.status === "failed" && shouldSkipFailedInvestmentRow(inv, investments, txId)) {
      continue;
    }

    rows.push({
      kind: "investment",
      entityId: inv.id,
      txId,
      type: "out",
      amountUsdt: inv.amountUsdt,
      status,
      label: `Investment order (${fundName})`,
      occurredAt: inv.date,
      tronscanUrl: onChain.tronscanUrl,
      chainFinal: status !== "pending",
    });

    if (
      inv.redemptionTransaction &&
      ["redeeming", "redeemed"].includes(inv.status)
    ) {
      const redeemLinks = usdtLinks(
        tron.getTxId(transactionFromJson(inv.redemptionTransaction))
      );
      const redeemTxId = redeemLinks.txId;
      if (redeemTxId) {
        fundPaymentTxIds.add(redeemTxId);
      }
      const redeemStatus = inv.status === "redeemed" ? "confirmed" : "pending";
      rows.push({
        kind: "redemption",
        entityId: inv.id,
        txId: redeemTxId,
        type: "in",
        amountUsdt: inv.projectedPayoutUsdt,
        status: redeemStatus,
        label: `Earnings credited (${fundName})`,
        occurredAt: inv.redeemedAt || inv.date,
        tronscanUrl: redeemLinks.tronscanUrl,
        chainFinal: redeemStatus === "confirmed",
      });
    }
  }

  const failedOrders = orders.filter((order) => order.status === "failed");
  const pendingInvestmentIds = new Set(
    investments
      .filter((inv) => inv.status === "pending")
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
    if (!shouldShowFailedInvestment(item, orders, txId)) {
      continue;
    }

    rows.push({
      kind: "failed_investment",
      entityId: item.id,
      txId,
      type: "out",
      amountUsdt: item.amountUsdt,
      status: "failed",
      label: `Failed investment order (${fundName})`,
      occurredAt: item.date,
      tronscanUrl: txId ? getTronscanTxUrl(txId) : null,
      chainFinal: true,
    });
  }

  for (const order of orders) {
    const fund = getFundById(order.fundId);
    const fundName = fund?.name || order.fundId;

    if (order.status === "completed") {
      const linkedInvestment = order.investmentId
        ? investmentsById.get(String(order.investmentId))
        : investments.find(
            (inv) =>
              inv.purchaseOrderId && String(inv.purchaseOrderId) === String(order.id)
          );
      if (linkedInvestment && linkedInvestment.status !== "failed") {
        continue;
      }
      const { txId, tronscanUrl } = getPurchaseOrderActivityLink(order);
      rows.push({
        kind: "purchase_order",
        entityId: order.id,
        txId,
        type: "out",
        amountUsdt: order.costUsdt,
        status: "confirmed",
        label: `Investment order (${fundName})`,
        occurredAt: order.updatedAt || order.date,
        tronscanUrl,
        chainFinal: true,
      });
      continue;
    }

    if (
      order.investmentId &&
      pendingInvestmentIds.has(String(order.investmentId))
    ) {
      continue;
    }

    if (
      getEnv().deferInvestmentUntilConfirm &&
      order.usdtTxId &&
      deriveOrderSettlementPhaseFromDb(order) === "confirming"
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

    const isFailed = shouldShowPurchaseOrderAsFailed(order);
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

    const label = isFailed
      ? `Failed investment order (${fundName})`
      : `Investment order (${fundName})`;
    const { txId, tronscanUrl } = getPurchaseOrderActivityLink(order);
    const pendingTapInfo = !isFailed
      ? getPendingPurchaseOrderTapInfo(order, fundName)
      : null;

    rows.push({
      kind: "purchase_order",
      entityId: order.id,
      txId,
      type: "out",
      amountUsdt: order.costUsdt,
      status: isFailed ? "failed" : "pending",
      label,
      detail: isFailed ? getFailedPurchaseOrderDetail(order) : null,
      occurredAt: order.updatedAt || order.date,
      tronscanUrl,
      chainFinal: isFailed && order.paymentChainFinal,
      pendingTapInfo,
    });
  }

  for (const transfer of chainTransfers) {
    if (transfer.txId && fundPaymentTxIds.has(transfer.txId)) {
      continue;
    }
    const type = transfer.type === "in" ? "in" : "out";
    const status = transfer.status.toLowerCase();
    rows.push({
      kind: "usdt_transfer",
      entityId: transfer.id,
      txId: transfer.txId,
      type,
      amountUsdt: transfer.amountUsdt,
      status,
      label:
        type === "in"
          ? status === "pending"
            ? "Receiving USDT"
            : "USDT received"
          : "USDT sent",
      occurredAt: transfer.chainDate,
      tronscanUrl: getTronscanTxUrl(transfer.txId),
      chainFinal: transfer.statusFinal,
    });
  }

  return dedupeFundActivityRows(rows);
}

function walletActivityEntityKey(row: {
  kind: string;
  entityId: string | null;
  txId?: string | null;
}): string {
  if (row.entityId) {
    return `${row.kind}:${row.entityId}`;
  }
  return `${row.kind}:${row.txId ?? "unknown"}`;
}

export function orphanWalletActivityDeleteWhere(
  walletId: string,
  keptIds: string[]
) {
  const preserveReferral = {
    kind: { notIn: [...REFERRAL_WALLET_ACTIVITY_KINDS] },
  };
  if (keptIds.length > 0) {
    return {
      walletId,
      id: { notIn: keptIds },
      ...preserveReferral,
    };
  }
  return {
    walletId,
    ...preserveReferral,
  };
}

export async function rebuildWalletActivity(
  userId: string,
  walletId: string,
  mainWalletId?: string | null
): Promise<number> {
  const rows = await buildMaterializedActivityRows(
    userId,
    walletId,
    mainWalletId
  );

  const existing = await prisma.walletActivity.findMany({
    where: { walletId },
    select: { id: true, kind: true, entityId: true, txId: true },
  });
  const existingIdByKey = new Map(
    existing.map((row) => [walletActivityEntityKey(row), row.id])
  );

  const keptIds: string[] = [];
  for (const row of rows) {
    const data = {
      kind: row.kind,
      entityId: row.entityId,
      txId: row.txId,
      type: row.type,
      amountUsdt: row.amountUsdt,
      status: row.status,
      label: row.label,
      detail: row.detail,
      occurredAt: row.occurredAt,
      tronscanUrl: row.tronscanUrl,
      chainFinal: row.chainFinal,
      pendingTapInfo: row.pendingTapInfo
        ? (row.pendingTapInfo as Prisma.InputJsonValue)
        : undefined,
    };
    const key = walletActivityEntityKey(row);
    const existingId = existingIdByKey.get(key);
    if (existingId) {
      await prisma.walletActivity.update({
        where: { id: existingId },
        data,
      });
      keptIds.push(existingId);
    } else {
      const created = await prisma.walletActivity.create({
        data: { userId, walletId, ...data },
      });
      keptIds.push(created.id);
    }
  }

  await prisma.walletActivity.deleteMany({
    where: orphanWalletActivityDeleteWhere(walletId, keptIds),
  });

  await prisma.wallet.update({
    where: { id: walletId },
    data: { activitySyncedAt: new Date() },
  });

  return rows.length;
}

export function walletActivityRecordToTx(row: {
  id: string;
  kind: string;
  entityId: string | null;
  txId: string | null;
  type: string;
  amountUsdt: number;
  status: string;
  label: string;
  detail: string | null;
  occurredAt: Date;
  tronscanUrl: string | null;
  pendingTapInfo: unknown;
  displayStatus?: string;
  settlementPhase?: string;
  settlementLabel?: string;
},
  insights?: TransactionInsights,
  onChain?: WalletOnChainLinks | null,
  withdrawalMeta?: {
    withdrawalOrderId: string;
    senderAddress: string | null;
    recipientAddress: string;
  } | null,
  referralRequisites?: import("@/services/referrals/referralRequisites").ReferralRequisite[]
): WalletActivityTx {
  const isReferralKind =
    row.kind === "referral_bonus_pending" ||
    row.kind === "referral_bonus_processing" ||
    row.kind === "referral_bonus_credited" ||
    row.kind === "referral_principal_recovery";

  const idPrefix =
    row.kind === "investment"
      ? "investment"
      : row.kind === "redemption"
        ? "redemption"
        : row.kind === "purchase_order"
          ? "purchase-order"
          : row.kind === "withdrawal_order"
            ? "withdrawal-order"
            : row.kind === "withdrawal"
              ? "withdrawal"
              : row.kind === "failed_investment"
                ? "failed-investment"
                : "chain";

  const entitySuffix = row.entityId ? `-${row.entityId}` : "";
  const id = isReferralKind
    ? (row.entityId ?? row.id)
    : row.kind === "usdt_transfer"
      ? `chain-${row.txId ?? row.id}`
      : `${idPrefix}${entitySuffix}`;

  return {
    id,
    type: row.type,
    source: row.kind === "usdt_transfer" ? "chain" : "app",
    amount: row.amountUsdt,
    status: row.status,
    label: row.label,
    date: row.occurredAt,
    txId: onChain?.txId ?? row.txId,
    tronscanUrl: onChain?.tronscanUrl ?? row.tronscanUrl,
    topUpTxId: onChain?.topUpTxId ?? null,
    topUpTronscanUrl: onChain?.topUpTronscanUrl ?? null,
    detail: row.detail,
    pendingTapInfo:
      row.pendingTapInfo &&
      typeof row.pendingTapInfo === "object" &&
      !Array.isArray(row.pendingTapInfo)
        ? (row.pendingTapInfo as { title: string; message: string })
        : null,
    displayStatus: row.displayStatus,
    settlementPhase: row.settlementPhase,
    settlementLabel: row.settlementLabel,
    insights,
    withdrawalOrderId: withdrawalMeta?.withdrawalOrderId ?? null,
    senderAddress: withdrawalMeta?.senderAddress ?? null,
    recipientAddress: withdrawalMeta?.recipientAddress ?? null,
    referralRequisites,
  };
}
