import { PurchaseOrderStatus, type PurchaseOrder, type Wallet } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { parseIndieFundrMemo } from "@/lib/tron/transactionMemo";
import { slimWalletActivityTx, uiSnapshotLog } from "@/lib/uiSnapshotLog";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import * as tron from "@/services/tron/client";
import type { Trc20TransferRow } from "@/services/tron/client";
import { buildAppTransactions } from "./walletTransactions";
import {
  appTransactionToActivityTx,
  getGenericChainActivityLabel,
} from "./walletActivityLabels";
import {
  mergeMemoActivityWithDbMatch,
  mergeWalletActivityTransaction,
  preferWalletActivityTx,
  upgradeActivityTxWithChainStatus,
  type WalletActivityTx,
} from "./walletActivityMerge";
import type {
  WalletActivitySyncMeta,
  WalletTransactionsPayload,
} from "./walletActivityTypes";
import { classifyChainRowFromMemo } from "./walletActivityMemo";
import {
  buildHiddenFailedUsdtTxIds,
  collectWinningPaymentTxIds,
} from "./fundInvestmentActivity";
import { healPurchaseOrderFromChainTruth } from "@/services/orders/purchaseOrderProcessor";
import { isManualFulfillmentOrder } from "@/services/orders/purchaseOrderManual";
import { syncWallet } from "./walletSyncService";
import { isPortfolioLightPoll } from "./investmentPortfolio";

type EnrichedChainRow = Trc20TransferRow & {
  status: "confirmed" | "failed" | "pending";
};

type ChainReadCacheEntry = {
  expiresAt: number;
  payload: WalletTransactionsPayload;
};

const chainReadCache = new Map<string, ChainReadCacheEntry>();
const CHAIN_READ_CACHE_MS = 5_000;

const PURCHASE_ORDER_ID_PREFIX = "purchase-order-";

function isActivityStale(activitySyncedAt: Date | null | undefined): boolean {
  const env = getEnv();
  if (!activitySyncedAt) {
    return true;
  }
  return Date.now() - activitySyncedAt.getTime() > env.walletSyncStaleMs;
}

function chainRowToGenericActivityTx(row: EnrichedChainRow): WalletActivityTx {
  const status = row.status.toLowerCase();
  return {
    id: `chain-${row.txId}`,
    type: row.type,
    source: "chain",
    amount: row.amount,
    status,
    label: getGenericChainActivityLabel(row.type, status),
    date: row.date,
    txId: row.txId,
    tronscanUrl: getTronscanTxUrl(row.txId),
  };
}

export type DbActivityIndex = {
  byTxId: Map<string, WalletActivityTx>;
  pendingWithoutTx: WalletActivityTx[];
};

export type BuildDbActivityIndexOptions = {
  skipOrderReconcile?: boolean;
  successPaymentTxIds?: Set<string>;
  completedOrderIds?: Set<string>;
};

function isAppTransactionPending(app: { status: string }): boolean {
  return app.status === "pending";
}

function shouldIncludePendingWithoutTx(
  tx: WalletActivityTx,
  successPaymentTxIds: Set<string>,
  completedOrderIds: Set<string>
): boolean {
  if (tx.txId && successPaymentTxIds.has(tx.txId)) {
    return false;
  }
  if (tx.id.startsWith(PURCHASE_ORDER_ID_PREFIX)) {
    const orderId = tx.id.slice(PURCHASE_ORDER_ID_PREFIX.length);
    if (completedOrderIds.has(orderId)) {
      return false;
    }
  }
  return true;
}

export async function buildDbActivityIndex(
  userId: string,
  walletId: string,
  {
    skipOrderReconcile = false,
    successPaymentTxIds = new Set(),
    completedOrderIds = new Set(),
  }: BuildDbActivityIndexOptions = {}
): Promise<DbActivityIndex> {
  const appTransactions = await buildAppTransactions(userId, walletId, null, {
    skipOrderReconcile,
  });

  const byTxId = new Map<string, WalletActivityTx>();
  const pendingWithoutTx: WalletActivityTx[] = [];

  for (const app of appTransactions) {
    const tx = appTransactionToActivityTx(app);
    if (app.txId) {
      const existing = byTxId.get(app.txId);
      if (existing) {
        byTxId.set(app.txId, preferWalletActivityTx(existing, tx));
      } else {
        byTxId.set(app.txId, tx);
      }
      continue;
    }

    if (isAppTransactionPending(app)) {
      if (shouldIncludePendingWithoutTx(tx, successPaymentTxIds, completedOrderIds)) {
        pendingWithoutTx.push(tx);
      }
    }
  }

  return { byTxId, pendingWithoutTx };
}

export function mergeChainRowsWithDbIndex(
  chainRows: EnrichedChainRow[],
  index: DbActivityIndex,
  successPaymentTxIds: Set<string>,
  memoByTxId: Map<string, WalletActivityTx> = new Map(),
  completedOrderIds: Set<string> = new Set(),
  hiddenFailedUsdtTxIds: Set<string> = new Set()
): WalletActivityTx[] {
  const merged = new Map<string, WalletActivityTx>();

  for (const row of chainRows) {
    if (hiddenFailedUsdtTxIds.has(row.txId)) {
      continue;
    }

    const memoTx = memoByTxId.get(row.txId);
    const dbMatch = index.byTxId.get(row.txId);
    const matched =
      memoTx && dbMatch
        ? mergeMemoActivityWithDbMatch(memoTx, dbMatch)
        : memoTx ?? dbMatch;

    if (
      !memoTx &&
      !matched &&
      row.type === "out" &&
      successPaymentTxIds.has(row.txId)
    ) {
      continue;
    }

    if (
      !memoTx &&
      matched?.source === "app" &&
      matched.id.startsWith(PURCHASE_ORDER_ID_PREFIX)
    ) {
      mergeWalletActivityTransaction(
        merged,
        upgradeActivityTxWithChainStatus(matched, row.status)
      );
      continue;
    }

    let chainTx = matched ?? chainRowToGenericActivityTx(row);
    chainTx = upgradeActivityTxWithChainStatus(chainTx, row.status);

    if (
      chainTx.status === "failed" &&
      chainTx.txId &&
      successPaymentTxIds.has(chainTx.txId)
    ) {
      continue;
    }

    if (
      chainTx.id.startsWith("chain-") &&
      memoByTxId.has(row.txId)
    ) {
      continue;
    }

    mergeWalletActivityTransaction(merged, chainTx);
  }

  for (const pending of index.pendingWithoutTx) {
    if (
      !shouldIncludePendingWithoutTx(
        pending,
        successPaymentTxIds,
        completedOrderIds
      )
    ) {
      continue;
    }
    const key = pending.id;
    if (!merged.has(key)) {
      merged.set(key, pending);
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function buildSuccessPaymentTxIds(orders: Array<{
  usdtTxId: string | null;
  failedUsdtTxIds: string[];
  paymentChainOutcome: string | null;
  status: PurchaseOrderStatus;
}>): Set<string> {
  return collectWinningPaymentTxIds(orders);
}

function buildCompletedOrderIds(
  orders: Array<{ id: string; status: PurchaseOrderStatus }>
): Set<string> {
  return new Set(
    orders
      .filter((order) => order.status === PurchaseOrderStatus.completed)
      .map((order) => order.id)
  );
}

async function buildMemoActivityIndex(
  userId: string,
  walletId: string,
  walletAddress: string,
  chainRows: EnrichedChainRow[]
): Promise<Map<string, WalletActivityTx>> {
  const env = getEnv();
  const treasuryAddress = env.treasuryAddress || null;
  const txIds = chainRows.map((r) => r.txId).filter(Boolean);
  if (!txIds.length) {
    return new Map();
  }

  const memoStrings = await tron.getTransactionMemosBatch(txIds, {
    concurrency: env.walletActivityStatusConcurrency,
  });

  const memoByTxId = new Map<string, WalletActivityTx>();
  const healOrderIds = new Set<string>();
  for (const row of chainRows) {
    const memoRaw = memoStrings.get(row.txId);
    const parsed = parseIndieFundrMemo(memoRaw);
    if (!parsed) {
      continue;
    }
    const classified = await classifyChainRowFromMemo({
      userId,
      walletId,
      walletAddress,
      treasuryAddress,
      row: {
        txId: row.txId,
        type: row.type,
        amount: row.amount,
        date: row.date,
        from: row.from,
        to: row.to,
        status: row.status,
      },
      parsedMemo: parsed,
    });
    if (classified) {
      memoByTxId.set(row.txId, classified.tx);
      if (classified.healOrderId) {
        healOrderIds.add(classified.healOrderId);
      }
    }
  }
  for (const orderId of healOrderIds) {
    void (async () => {
      const order = await prisma.purchaseOrder.findUnique({
        where: { id: orderId },
      });
      if (!order || isManualFulfillmentOrder(order)) {
        return;
      }
      await healPurchaseOrderFromChainTruth(order);
    })().catch((err) => {
      console.error(
        "[wallet:activity] memo heal failed",
        orderId,
        err instanceof Error ? err.message : err
      );
    });
  }
  return memoByTxId;
}

function scheduleBackgroundSync(
  userId: string,
  walletId: string,
  pollSource: string | undefined,
  stale: boolean,
  neverSynced: boolean
): void {
  if (!stale && !neverSynced) {
    return;
  }
  void syncWallet(userId, walletId, {
    reason: pollSource ?? (neverSynced ? "first_read" : "stale_read"),
  }).catch((syncError) => {
    console.error(
      "[wallet:activity] background sync failed",
      syncError instanceof Error ? syncError.message : syncError
    );
  });
}

export async function resolveWalletActivityFromChain(
  userId: string,
  wallet: Wallet,
  { pollSource }: { pollSource?: string } = {}
): Promise<WalletTransactionsPayload> {
  const cacheKey = wallet.id;

  const stale = isActivityStale(wallet.activitySyncedAt);
  const neverSynced = !wallet.activitySyncedAt;

  const cached = chainReadCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  scheduleBackgroundSync(userId, wallet.id, pollSource, stale, neverSynced);

  const syncMeta: WalletActivitySyncMeta = {
    lastSyncedAt: wallet.activitySyncedAt?.toISOString() ?? null,
    chainSyncedThroughAt:
      wallet.chainSyncedThroughAt?.toISOString() ?? null,
    stale,
  };

  const env = getEnv();

  let chainHistoryError = false;
  let transactions: WalletActivityTx[] = [];
  let memoMatchCount = 0;

  try {
    const walletOrders = await prisma.purchaseOrder.findMany({
      where: { userId, walletId: wallet.id },
      select: {
        id: true,
        usdtTxId: true,
        failedUsdtTxIds: true,
        paymentChainOutcome: true,
        status: true,
      },
    });

    const successPaymentTxIds = buildSuccessPaymentTxIds(walletOrders);
    const completedOrderIds = buildCompletedOrderIds(walletOrders);
    const hiddenFailedUsdtTxIds = buildHiddenFailedUsdtTxIds(walletOrders);

    const [chainRows, index] = await Promise.all([
      tron.getTrc20UsdtTransfers(wallet.address, {
        limit: env.walletActivityChainLimit,
      }),
      buildDbActivityIndex(userId, wallet.id, {
        skipOrderReconcile: true,
        successPaymentTxIds,
        completedOrderIds,
      }),
    ]);

    const enriched = await tron.enrichTrc20TransferStatuses(chainRows, {
      concurrency: env.walletActivityStatusConcurrency,
      fallbackStatusOnLookupError: "confirmed",
    });

    const memoByTxId = await buildMemoActivityIndex(
      userId,
      wallet.id,
      wallet.address,
      enriched
    );
    memoMatchCount = memoByTxId.size;
    transactions = mergeChainRowsWithDbIndex(
      enriched,
      index,
      successPaymentTxIds,
      memoByTxId,
      completedOrderIds,
      hiddenFailedUsdtTxIds
    );
  } catch (chainError) {
    console.error(
      "[wallet:activity] chain read failed",
      chainError instanceof Error ? chainError.message : chainError
    );
    chainHistoryError = true;
    transactions = await loadMaterializedTransactions(userId, wallet);
  }

  const payload: WalletTransactionsPayload = {
    transactions,
    chainHistoryError,
    syncing: neverSynced || stale,
    sync: syncMeta,
    nextCursor: null,
    hasMore: false,
  };

  if (!chainHistoryError) {
    chainReadCache.set(cacheKey, {
      expiresAt: Date.now() + CHAIN_READ_CACHE_MS,
      payload,
    });
  }

  uiSnapshotLog("wallet.transactions", {
    readMode: "chain",
    pollSource: pollSource ?? null,
    userId,
    walletId: wallet.id,
    address: wallet.address,
    chainCount: transactions.filter((t) => t.source === "chain").length,
    memoMatchCount,
    sync: syncMeta,
    syncing: payload.syncing,
    chainHistoryError: payload.chainHistoryError,
    count: transactions.length,
    transactions: transactions.map(slimWalletActivityTx),
  });

  return payload;
}

async function loadMaterializedTransactions(
  userId: string,
  wallet: Wallet
): Promise<WalletActivityTx[]> {
  const { walletActivityRecordToTx } = await import(
    "./walletActivityMaterializer"
  );
  const { hydrateActivityInsightsBatch } = await import(
    "./hydrateActivityInsights"
  );
  const { hydrateActivityOnChainLinksBatch } = await import(
    "./hydrateActivityOnChainLinks"
  );
  const { hydrateWithdrawalActivityMetaBatch } = await import(
    "./hydrateWithdrawalActivityMeta"
  );
  const { hydrateReferralRequisitesBatch } = await import(
    "./hydrateReferralRequisites"
  );
  const env = getEnv();

  const [rows, walletOrders] = await Promise.all([
    prisma.walletActivity.findMany({
      where: { userId, walletId: wallet.id },
      orderBy: { occurredAt: "desc" },
      take: env.walletActivityLimit,
    }),
    prisma.purchaseOrder.findMany({
      where: { userId, walletId: wallet.id },
      select: {
        id: true,
        usdtTxId: true,
        failedUsdtTxIds: true,
        paymentChainOutcome: true,
        status: true,
      },
    }),
  ]);

  const successPaymentTxIds = buildSuccessPaymentTxIds(walletOrders);
  const [insightsByRow, onChainByRow, withdrawalMetaByRow, referralRequisitesByRow] =
    await Promise.all([
      hydrateActivityInsightsBatch(userId, rows),
      hydrateActivityOnChainLinksBatch(userId, rows),
      hydrateWithdrawalActivityMetaBatch(userId, rows),
      hydrateReferralRequisitesBatch(userId, rows),
    ]);
  const merged = new Map<string, WalletActivityTx>();
  for (const row of rows) {
    if (
      row.status === "failed" &&
      row.txId &&
      successPaymentTxIds.has(row.txId)
    ) {
      continue;
    }
    const rowKey = row.entityId ? `${row.kind}:${row.entityId}` : null;
    const insights = rowKey ? insightsByRow.get(rowKey) : undefined;
    const onChain = rowKey ? onChainByRow.get(rowKey) : undefined;
    const withdrawalMeta = rowKey ? withdrawalMetaByRow.get(rowKey) : undefined;
    const referralRequisites = rowKey
      ? referralRequisitesByRow.get(rowKey)
      : undefined;
    mergeWalletActivityTransaction(
      merged,
      walletActivityRecordToTx(
        row,
        insights,
        onChain,
        withdrawalMeta,
        referralRequisites
      )
    );
  }

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
