import { getFundById } from "@/lib/config/investmentFunds";
import { getEnv } from "@/lib/env";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import type { AdminWithdrawalCategoryOverride } from "@/services/admin/treasuryClassification";
import {
  applyWithdrawalCategoryOverride,
  loadCategoryOverridesByTxId,
} from "@/services/admin/treasuryTxClassification";
import { recordAppWithdrawal } from "@/services/revenueEngine";
import { getOrCreateLedger } from "@/services/revenueEngine/ledger";
import {
  loadInflowTreatmentByTxId,
  type ExternalInflowTreatment,
} from "@/services/revenueEngine/externalTreasuryInflows";
import * as tron from "@/services/tron/client";
import type { Trc20TransferRow } from "@/services/tron/client";

export type TreasuryChainCategory =
  | "user_payment"
  | "user_payout"
  | "app_withdrawal"
  | "treasury_outflow_untracked"
  | "external_in"
  | "wallet_match_unconfirmed";

export type ClassificationSource = "app_tx" | "address_only" | "external";

export type TreasuryChainTransaction = {
  txId: string;
  type: "in" | "out";
  category: TreasuryChainCategory;
  classificationSource: ClassificationSource;
  amount: number;
  status: "confirmed" | "failed" | "pending";
  date: Date;
  counterparty: string;
  userEmail: string | null;
  detail: string | null;
  tronscanUrl: string;
  ledgerRecorded: boolean;
  adminCategoryOverride: AdminWithdrawalCategoryOverride | null;
  inflowTreatment: ExternalInflowTreatment;
  inflowActionsEligible: boolean;
};

export type TreasuryOnChainBalances = {
  address: string;
  network: "testnet" | "mainnet";
  usdt: number;
  trx: number;
};

export type TreasuryChainSummaryCategory = {
  count: number;
  totalUsdt: number;
};

export type TreasuryChainSummary = {
  byCategory: Record<TreasuryChainCategory, TreasuryChainSummaryCategory>;
  unrecordedWithdrawalCount: number;
  totalTransactions: number;
};

export type TreasuryTrxAlert = {
  level: "warning";
  message: string;
  thresholdTrx: number;
  currentTrx: number;
} | null;

export type TreasuryWithdrawalSyncResult = {
  recorded: number;
  skipped: number;
  failed: Array<{ txId: string; error: string }>;
};

export type TreasuryOnChainReport = {
  balances: TreasuryOnChainBalances;
  transactions: TreasuryChainTransaction[];
  chainSummary: TreasuryChainSummary;
  withdrawalSync: TreasuryWithdrawalSyncResult;
  trxAlert: TreasuryTrxAlert;
  chainHistoryError: boolean;
};

type WalletIndexEntry = {
  userId: string | null;
  email: string | null;
};

type EnrichmentContext = {
  treasuryAddress: string;
  userWalletAddresses: Set<string>;
  walletByAddress: Map<string, WalletIndexEntry>;
  orderByTxId: Map<string, { userEmail: string | null; detail: string }>;
  redemptionByTxId: Map<string, { userEmail: string | null; detail: string }>;
  /** AppRevenueWithdrawal rows linked by on-chain tx ref (eligible for ledger sync). */
  appWithdrawalByTxId: Set<string>;
  recordedWithdrawalTxIds: Set<string>;
  categoryOverrideByTxId: Map<string, AdminWithdrawalCategoryOverride>;
  inflowTreatmentByTxId: Map<string, { treatment: ExternalInflowTreatment }>;
};

function transactionFromJson(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function emptySummary(): TreasuryChainSummary["byCategory"] {
  return {
    user_payment: { count: 0, totalUsdt: 0 },
    user_payout: { count: 0, totalUsdt: 0 },
    app_withdrawal: { count: 0, totalUsdt: 0 },
    treasury_outflow_untracked: { count: 0, totalUsdt: 0 },
    external_in: { count: 0, totalUsdt: 0 },
    wallet_match_unconfirmed: { count: 0, totalUsdt: 0 },
  };
}

/** @deprecated Use classifyTreasuryRow — kept for unit tests of address-only heuristics */
export function classifyTreasuryTransfer(
  row: Pick<Trc20TransferRow, "type" | "from" | "to">,
  walletAddresses: Set<string>
): TreasuryChainCategory {
  const counterparty = row.type === "in" ? row.from : row.to;
  const isKnownWallet = walletAddresses.has(counterparty);
  if (row.type === "in") {
    return isKnownWallet ? "wallet_match_unconfirmed" : "external_in";
  }
  return isKnownWallet ? "wallet_match_unconfirmed" : "app_withdrawal";
}

export function categoryLabel(category: TreasuryChainCategory): string {
  switch (category) {
    case "user_payment":
      return "User payment";
    case "user_payout":
      return "User payout";
    case "app_withdrawal":
      return "App withdrawal";
    case "treasury_outflow_untracked":
      return "Treasury outflow (untracked)";
    case "external_in":
      return "External deposit";
    case "wallet_match_unconfirmed":
      return "Wallet match only";
    default:
      return category;
  }
}

function isInternalOrSelfTransfer(
  row: Pick<Trc20TransferRow, "from" | "to">,
  treasuryAddress: string
): boolean {
  if (row.from === row.to) return true;
  if (row.from === treasuryAddress && row.to === treasuryAddress) return true;
  return false;
}

export function classifyTreasuryRow(
  row: Pick<Trc20TransferRow, "txId" | "type" | "from" | "to">,
  ctx: EnrichmentContext
): { category: TreasuryChainCategory; source: ClassificationSource } | null {
  if (isInternalOrSelfTransfer(row, ctx.treasuryAddress)) {
    return null;
  }

  const counterparty = row.type === "in" ? row.from : row.to;
  const isUserWallet =
    counterparty !== ctx.treasuryAddress &&
    ctx.userWalletAddresses.has(counterparty);

  if (ctx.orderByTxId.has(row.txId)) {
    return { category: "user_payment", source: "app_tx" };
  }
  if (ctx.redemptionByTxId.has(row.txId)) {
    return { category: "user_payout", source: "app_tx" };
  }

  if (row.type === "out") {
    if (!isUserWallet || counterparty === ctx.treasuryAddress) {
      if (ctx.appWithdrawalByTxId.has(row.txId)) {
        return { category: "app_withdrawal", source: "app_tx" };
      }
      return { category: "treasury_outflow_untracked", source: "external" };
    }
    return { category: "wallet_match_unconfirmed", source: "address_only" };
  }

  if (!isUserWallet) {
    return { category: "external_in", source: "external" };
  }
  return { category: "wallet_match_unconfirmed", source: "address_only" };
}

async function loadEnrichmentContext(
  treasuryAddress: string
): Promise<EnrichmentContext> {
  const [
    wallets,
    orders,
    investments,
    withdrawals,
    categoryOverrideByTxId,
    inflowTreatmentByTxId,
  ] = await Promise.all([
    prisma.wallet.findMany({
      select: {
        address: true,
        userId: true,
        user: { select: { email: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { usdtTxId: { not: null } },
      select: {
        usdtTxId: true,
        fundId: true,
        user: { select: { email: true } },
      },
    }),
    prisma.investment.findMany({
      where: { redemptionTransaction: { not: null } },
      select: {
        fundId: true,
        redemptionTransaction: true,
        user: { select: { email: true } },
      },
    }),
    prisma.appRevenueWithdrawal.findMany({
      where: { txRef: { not: null } },
      select: { txRef: true },
    }),
    loadCategoryOverridesByTxId(),
    loadInflowTreatmentByTxId(),
  ]);

  const walletByAddress = new Map<string, WalletIndexEntry>();
  const userWalletAddresses = new Set<string>();

  for (const wallet of wallets) {
    const normalized =
      (await tron.normalizeTronAddress(wallet.address)) ?? wallet.address;
    if (normalized === treasuryAddress) continue;
    walletByAddress.set(normalized, {
      userId: wallet.userId,
      email: wallet.user?.email ?? null,
    });
    userWalletAddresses.add(normalized);
  }

  const orderByTxId = new Map<string, { userEmail: string | null; detail: string }>();
  for (const order of orders) {
    if (!order.usdtTxId) continue;
    const fund = getFundById(order.fundId);
    orderByTxId.set(order.usdtTxId, {
      userEmail: order.user?.email ?? null,
      detail: `Subscribe (${fund?.name ?? order.fundId})`,
    });
  }

  const redemptionByTxId = new Map<
    string,
    { userEmail: string | null; detail: string }
  >();
  for (const inv of investments) {
    const txId = tron.getTxId(transactionFromJson(inv.redemptionTransaction));
    if (!txId) continue;
    const fund = getFundById(inv.fundId);
    redemptionByTxId.set(txId, {
      userEmail: inv.user?.email ?? null,
      detail: `Redemption (${fund?.name ?? inv.fundId})`,
    });
  }

  const appWithdrawalByTxId = new Set<string>();
  const recordedWithdrawalTxIds = new Set<string>();
  for (const withdrawal of withdrawals) {
    const txRef = withdrawal.txRef?.trim();
    if (!txRef) continue;
    appWithdrawalByTxId.add(txRef);
    recordedWithdrawalTxIds.add(txRef);
  }

  return {
    treasuryAddress,
    userWalletAddresses,
    walletByAddress,
    orderByTxId,
    redemptionByTxId,
    appWithdrawalByTxId,
    recordedWithdrawalTxIds,
    categoryOverrideByTxId,
    inflowTreatmentByTxId,
  };
}

function enrichChainRow(
  row: Trc20TransferRow & { status: "confirmed" | "failed" | "pending" },
  ctx: EnrichmentContext
): TreasuryChainTransaction | null {
  const classified = classifyTreasuryRow(row, ctx);
  if (!classified) return null;

  const withOverride = applyWithdrawalCategoryOverride(
    row.txId,
    classified,
    ctx.categoryOverrideByTxId
  );
  const { category, source } = withOverride;
  const adminCategoryOverride =
    ctx.categoryOverrideByTxId.get(row.txId) ?? null;
  const counterparty = row.type === "in" ? row.from : row.to;
  const walletEntry = ctx.walletByAddress.get(counterparty);

  let userEmail = walletEntry?.email ?? null;
  let detail: string | null = null;

  const orderMatch = ctx.orderByTxId.get(row.txId);
  if (orderMatch) {
    userEmail = orderMatch.userEmail ?? userEmail;
    detail = orderMatch.detail;
  }

  const redemptionMatch = ctx.redemptionByTxId.get(row.txId);
  if (redemptionMatch) {
    userEmail = redemptionMatch.userEmail ?? userEmail;
    detail = redemptionMatch.detail;
  }

  if (!detail) {
    detail = categoryLabel(category);
  }

  const ledgerRecorded = ctx.recordedWithdrawalTxIds.has(row.txId);
  const inflowTreatment =
    ctx.inflowTreatmentByTxId.get(row.txId)?.treatment ?? "none";
  const inflowActionsEligible =
    category === "external_in" &&
    row.type === "in" &&
    row.status === "confirmed";

  return {
    txId: row.txId,
    type: row.type,
    category,
    classificationSource: source,
    amount: row.amount,
    status: row.status,
    date: row.date,
    counterparty,
    userEmail,
    detail,
    tronscanUrl: getTronscanTxUrl(row.txId),
    ledgerRecorded,
    adminCategoryOverride,
    inflowTreatment,
    inflowActionsEligible,
  };
}

export type RecordAppWithdrawalFn = typeof recordAppWithdrawal;

type SyncLedgerReader = () => Promise<{
  poolAvailable: number;
  treasurySurplus: number;
}>;

export async function syncOnChainAppWithdrawals(
  transactions: TreasuryChainTransaction[],
  ctx: EnrichmentContext,
  recordFn: RecordAppWithdrawalFn = recordAppWithdrawal,
  readLedger: SyncLedgerReader = getOrCreateLedger
): Promise<TreasuryWithdrawalSyncResult> {
  const result: TreasuryWithdrawalSyncResult = {
    recorded: 0,
    skipped: 0,
    failed: [],
  };

  const candidates = transactions.filter(
    (tx) =>
      tx.category === "app_withdrawal" &&
      tx.classificationSource === "app_tx" &&
      tx.status === "confirmed" &&
      tx.type === "out"
  );

  if (candidates.length === 0) {
    return result;
  }

  const ledger = await readLedger();
  const poolLiquidity = Math.max(
    0,
    ledger.poolAvailable - ledger.treasurySurplus
  );
  if (poolLiquidity <= 0) {
    if (getEnv().treasuryLedgerDebug || getEnv().treasuryOnchainDebug) {
      console.log(
        "[treasuryOnChain] skip withdrawal sync: no withdrawable pool liquidity (pool − surplus)"
      );
    }
    return result;
  }

  for (const tx of candidates) {
    if (ctx.recordedWithdrawalTxIds.has(tx.txId)) {
      result.skipped += 1;
      tx.ledgerRecorded = true;
      continue;
    }

    try {
      await recordFn({
        amountUsdt: tx.amount,
        txRef: tx.txId,
        note: "Synced from on-chain treasury transfer",
        createdBy: "system",
      });
      ctx.recordedWithdrawalTxIds.add(tx.txId);
      tx.ledgerRecorded = true;
      result.recorded += 1;
    } catch (error) {
      result.failed.push({
        txId: tx.txId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export function buildChainSummary(
  transactions: TreasuryChainTransaction[]
): TreasuryChainSummary {
  const byCategory = emptySummary();

  for (const tx of transactions) {
    const bucket = byCategory[tx.category];
    bucket.count += 1;
    bucket.totalUsdt = parseFloat((bucket.totalUsdt + tx.amount).toFixed(4));
  }

  const unrecordedWithdrawalCount = transactions.filter(
    (tx) =>
      tx.category === "app_withdrawal" &&
      tx.classificationSource === "app_tx" &&
      !tx.ledgerRecorded
  ).length;

  return {
    byCategory,
    unrecordedWithdrawalCount,
    totalTransactions: transactions.length,
  };
}

function logTreasuryOnChainDebug(payload: Record<string, unknown>) {
  console.log("[treasuryOnChain]", JSON.stringify(payload, null, 2));
}

export async function getTreasuryBalances(): Promise<TreasuryOnChainBalances> {
  const env = getEnv();
  const rawAddress = env.treasuryAddress.trim();
  const address =
    (await tron.normalizeTronAddress(rawAddress)) ?? rawAddress;
  if (!address) {
    return {
      address: "",
      network: env.blockchainNetwork,
      usdt: 0,
      trx: 0,
    };
  }

  const [usdt, trx] = await Promise.all([
    tron.getUsdtBalance(address),
    tron.getTrxBalance(address),
  ]);

  return {
    address,
    network: env.blockchainNetwork,
    usdt,
    trx,
  };
}

export async function getTreasuryUsdtActivity({
  limit,
}: { limit?: number } = {}) {
  const env = getEnv();
  const rawAddress = env.treasuryAddress.trim();
  if (!rawAddress) {
    return [];
  }

  const activityLimit = limit ?? env.treasuryActivityLimit;
  const rows = await tron.getTrc20UsdtTransfers(rawAddress, { limit: activityLimit });
  return tron.enrichTrc20TransferStatuses(rows, {
    concurrency: env.walletActivityStatusConcurrency,
    fallbackStatusOnLookupError: "confirmed",
  });
}

export function buildTrxAlert(trx: number): TreasuryTrxAlert {
  const threshold = getEnv().treasuryMinTrxBalance;
  if (trx >= threshold) {
    return null;
  }
  return {
    level: "warning",
    message: `Treasury TRX is low (${trx} TRX). Top up the treasury wallet so user transactions and fee sponsorship do not fail.`,
    thresholdTrx: threshold,
    currentTrx: trx,
  };
}

export async function buildTreasuryActivityReport(): Promise<TreasuryOnChainReport> {
  const env = getEnv();
  const rawAddress = env.treasuryAddress.trim();
  const treasuryAddress =
    (await tron.normalizeTronAddress(rawAddress)) ?? rawAddress;

  if (!treasuryAddress) {
    return {
      balances: {
        address: "",
        network: env.blockchainNetwork,
        usdt: 0,
        trx: 0,
      },
      transactions: [],
      chainSummary: buildChainSummary([]),
      withdrawalSync: { recorded: 0, skipped: 0, failed: [] },
      trxAlert: null,
      chainHistoryError: false,
    };
  }

  let chainHistoryError = false;
  let enrichedRows: Array<
    Trc20TransferRow & { status: "confirmed" | "failed" | "pending" }
  > = [];

  try {
    enrichedRows = await getTreasuryUsdtActivity();
  } catch (error) {
    console.error(
      "[treasuryOnChain] chain history failed:",
      error instanceof Error ? error.message : error
    );
    chainHistoryError = true;
  }

  const [balances, ctx] = await Promise.all([
    getTreasuryBalances(),
    loadEnrichmentContext(treasuryAddress),
  ]);

  const transactions: TreasuryChainTransaction[] = [];
  for (const row of enrichedRows) {
    const enriched = enrichChainRow(row, ctx);
    if (enriched) transactions.push(enriched);
  }
  transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

  const withdrawalSync: TreasuryWithdrawalSyncResult = {
    recorded: 0,
    skipped: 0,
    failed: [],
  };
  const chainSummary = buildChainSummary(transactions);

  if (env.treasuryOnchainDebug) {
    logTreasuryOnChainDebug({
      treasuryAddress,
      network: env.blockchainNetwork,
      balances,
      rawRowCount: enrichedRows.length,
      rawSample: enrichedRows.slice(0, 3).map((r) => ({
        txId: r.txId,
        type: r.type,
        from: r.from,
        to: r.to,
        amount: r.amount,
      })),
      userWalletCount: ctx.userWalletAddresses.size,
      orderTxCount: ctx.orderByTxId.size,
      redemptionTxCount: ctx.redemptionByTxId.size,
      withdrawalSync,
      chainSummary,
      classifiedSample: transactions.slice(0, 5).map((t) => ({
        txId: t.txId,
        category: t.category,
        source: t.classificationSource,
        amount: t.amount,
        counterparty: t.counterparty,
        ledgerRecorded: t.ledgerRecorded,
      })),
    });
  }

  return {
    balances,
    transactions,
    chainSummary,
    withdrawalSync,
    trxAlert: buildTrxAlert(balances.trx),
    chainHistoryError,
  };
}

export async function getTreasuryOnChainReport(): Promise<TreasuryOnChainReport> {
  return buildTreasuryActivityReport();
}

/** @deprecated Use buildChainSummary */
export function buildReconciliation(
  onChainUsdt: number,
  _ledger: unknown,
  transactions: TreasuryChainTransaction[]
) {
  const summary = buildChainSummary(transactions);
  return {
    onChainUsdt,
    bookUsdtEstimate: 0,
    deltaUsdt: onChainUsdt,
    unrecordedWithdrawalCount: summary.unrecordedWithdrawalCount,
  };
}
