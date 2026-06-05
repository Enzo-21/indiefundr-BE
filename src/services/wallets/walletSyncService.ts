import {
  InvestmentStatus,
  PurchaseOrderStatus,
  type Wallet,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import { getMainWallet } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import { reconcileWalletFundPayments } from "./fundPaymentReconciliation";
import * as tron from "@/services/tron/client";
import { parseIndieFundrMemo } from "@/lib/tron/transactionMemo";
import { rebuildWalletActivity } from "./walletActivityMaterializer";
import {
  ensureWalletChainSyncWatermark,
  persistChainSyncWatermark,
} from "./chainSyncWatermark";

export type WalletSyncResult = {
  walletId: string;
  lastSyncedAt: Date;
  ordersChecked: number;
  ordersHealed: number;
  transfersUpserted: number;
  activityCount: number;
};

async function syncWalletBalance(wallet: Wallet): Promise<void> {
  if (!(await tron.validateAddress(wallet.address))) {
    return;
  }

  const [onChainUsdt, pendingInboundUsdt] = await Promise.all([
    tron.getUsdtBalance(wallet.address),
    tron.getPendingIncomingUsdtTotal(wallet.address),
  ]);

  await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      onChainUsdtCached: onChainUsdt,
      onChainUsdtCachedAt: new Date(),
      pendingInboundCached: pendingInboundUsdt,
    },
  });
}

async function upsertChainTransferRows(
  wallet: Wallet,
  chainRows: tron.Trc20TransferRow[]
): Promise<number> {
  if (!chainRows.length) {
    return 0;
  }

  const env = getEnv();
  let upserted = 0;

  const existing = await prisma.walletChainTransfer.findMany({
    where: {
      walletId: wallet.id,
      txId: { in: chainRows.map((r) => r.txId) },
    },
    select: { txId: true, statusFinal: true, status: true },
  });
  const existingByTxId = new Map(existing.map((r) => [r.txId, r]));

  const needsStatus = chainRows.filter((row) => {
    const prev = existingByTxId.get(row.txId);
    if (!prev) {
      return true;
    }
    if (prev.statusFinal) {
      return false;
    }
    return prev.status !== "confirmed" && prev.status !== "failed";
  });

  const enriched = await tron.enrichTrc20TransferStatuses(needsStatus, {
    concurrency: env.walletActivityStatusConcurrency,
    fallbackStatusOnLookupError: "confirmed",
  });
  const enrichedByTxId = new Map(enriched.map((r) => [r.txId, r]));
  const txIds = chainRows.map((r) => r.txId);
  const memoByTxId = await tron.getTransactionMemosBatch(txIds, {
    concurrency: env.walletActivityStatusConcurrency,
  });

  for (const row of chainRows) {
    const enrichedRow = enrichedByTxId.get(row.txId);
    const status = enrichedRow?.status ?? "confirmed";
    const statusFinal = status === "confirmed" || status === "failed";
    const memo = memoByTxId.get(row.txId) ?? null;
    const parsedMemo = parseIndieFundrMemo(memo);

    await prisma.walletChainTransfer.upsert({
      where: {
        walletId_txId: { walletId: wallet.id, txId: row.txId },
      },
      create: {
        walletId: wallet.id,
        txId: row.txId,
        type: row.type,
        amountUsdt: row.amount,
        status,
        chainDate: row.date,
        statusFinal,
        memo,
        raw: {
          ...(row as object),
          memo,
          parsedMemo,
        },
      },
      update: {
        type: row.type,
        amountUsdt: row.amount,
        status,
        chainDate: row.date,
        statusFinal: statusFinal || undefined,
        memo,
        raw: {
          ...(row as object),
          memo,
          parsedMemo,
        },
      },
    });
    upserted += 1;
  }

  return upserted;
}

async function syncWalletChainTransfers(wallet: Wallet): Promise<number> {
  const env = getEnv();
  let upserted = 0;

  try {
    const { chainSyncedThroughAt, chainSyncBackfillComplete } =
      await ensureWalletChainSyncWatermark(wallet.id);

    const needsFullBackfill = !chainSyncBackfillComplete;
    let chainRows: tron.Trc20TransferRow[];

    if (needsFullBackfill) {
      chainRows = await tron.fetchTrc20UsdtTransfers(wallet.address, {
        maxRows: env.walletChainSyncMaxRows,
      });
      upserted += await upsertChainTransferRows(wallet, chainRows);
      await persistChainSyncWatermark(
        wallet.id,
        chainRows.map((r) => r.date),
        true
      );
    } else if (chainSyncedThroughAt) {
      const minTimestampMs = Math.max(
        0,
        chainSyncedThroughAt.getTime() - env.walletChainSyncOverlapMs
      );
      chainRows = await tron.getTrc20UsdtTransfersSince(wallet.address, {
        minTimestampMs,
        maxRows: env.walletChainSyncMaxRows,
      });
      upserted += await upsertChainTransferRows(wallet, chainRows);
      await persistChainSyncWatermark(
        wallet.id,
        chainRows.map((r) => r.date),
        true
      );
    } else {
      chainRows = await tron.fetchTrc20UsdtTransfers(wallet.address, {
        maxRows: env.walletChainSyncMaxRows,
      });
      upserted += await upsertChainTransferRows(wallet, chainRows);
      await persistChainSyncWatermark(
        wallet.id,
        chainRows.map((r) => r.date),
        true
      );
    }
  } catch (error) {
    console.error(
      "[walletSync] chain transfer sync failed",
      wallet.id,
      error instanceof Error ? error.message : error
    );
  }

  return upserted;
}

export async function syncWallet(
  userId: string,
  walletId: string,
  opts?: { reason?: string }
): Promise<WalletSyncResult> {
  const reason = opts?.reason ?? "unspecified";
  const startedAt = Date.now();
  console.log("[wallet:sync] syncWallet begin", { userId, walletId, reason });

  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId },
  });
  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const mainWallet = await getMainWallet(userId);

  await syncWalletBalance(wallet);
  const transfersUpserted = await syncWalletChainTransfers(wallet);
  const reconcile = await reconcileWalletFundPayments(userId, wallet.id);

  const activityCount = await rebuildWalletActivity(
    userId,
    wallet.id,
    mainWallet?.id
  );

  const refreshed = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: {
      activitySyncedAt: true,
      chainSyncedThroughAt: true,
      chainSyncBackfillComplete: true,
    },
  });

  const result = {
    walletId: wallet.id,
    lastSyncedAt: refreshed?.activitySyncedAt ?? new Date(),
    ordersChecked: reconcile.ordersProcessed,
    ordersHealed: reconcile.healed,
    transfersUpserted,
    activityCount,
  };

  console.log("[wallet:sync] syncWallet end", {
    userId,
    walletId,
    reason,
    elapsedMs: Date.now() - startedAt,
    activitySyncedAt: refreshed?.activitySyncedAt?.toISOString() ?? null,
    chainSyncedThroughAt:
      refreshed?.chainSyncedThroughAt?.toISOString() ?? null,
    chainSyncBackfillComplete: refreshed?.chainSyncBackfillComplete ?? false,
    ordersChecked: result.ordersChecked,
    ordersHealed: result.ordersHealed,
    transfersUpserted: result.transfersUpserted,
    activityCount: result.activityCount,
  });

  return result;
}

export async function syncUserWallets(userId: string): Promise<WalletSyncResult[]> {
  const wallets = await prisma.wallet.findMany({
    where: { userId },
    select: { id: true },
  });
  const results: WalletSyncResult[] = [];
  for (const wallet of wallets) {
    results.push(await syncWallet(userId, wallet.id));
  }
  return results;
}

export async function syncWalletsNeedingWork(
  limit?: number
): Promise<{ synced: number }> {
  const env = getEnv();
  const batchSize = limit ?? env.walletSyncBatchSize;
  const staleBefore = new Date(Date.now() - env.walletSyncStaleMs);

  const [pendingOrderWallets, staleWallets, pendingInvestmentWallets] =
    await Promise.all([
      prisma.purchaseOrder.findMany({
        where: {
          status: {
            in: [
              PurchaseOrderStatus.queued,
              PurchaseOrderStatus.processing,
              PurchaseOrderStatus.failed,
            ],
          },
          paymentChainFinal: false,
        },
        select: { userId: true, walletId: true },
        distinct: ["walletId"],
        take: batchSize,
      }),
      prisma.wallet.findMany({
        where: {
          OR: [
            { activitySyncedAt: null },
            { activitySyncedAt: { lt: staleBefore } },
            { onChainUsdtCachedAt: null },
            { onChainUsdtCachedAt: { lt: staleBefore } },
          ],
        },
        select: { id: true, userId: true },
        take: batchSize,
      }),
      prisma.investment.findMany({
        where: { status: InvestmentStatus.pending },
        select: { userId: true, walletId: true },
        distinct: ["walletId"],
        take: batchSize,
      }),
    ]);

  const walletJobs = new Map<string, string>();
  for (const row of pendingOrderWallets) {
    if (row.userId) {
      walletJobs.set(row.walletId, row.userId);
    }
  }
  for (const row of staleWallets) {
    if (row.userId) {
      walletJobs.set(row.id, row.userId);
    }
  }
  for (const row of pendingInvestmentWallets) {
    walletJobs.set(row.walletId, row.userId);
  }

  let synced = 0;
  for (const [walletId, userId] of walletJobs) {
    if (synced >= batchSize) {
      break;
    }
    try {
      await syncWallet(userId, walletId, { reason: "cron_batch" });
      synced += 1;
    } catch (error) {
      console.error(
        "[walletSync] batch sync failed",
        walletId,
        error instanceof Error ? error.message : error
      );
    }
  }

  return { synced };
}

export function isWalletBalanceCacheFresh(
  cachedAt: Date | null | undefined,
  ttlMs: number = getEnv().walletBalanceCacheTtlMs
): boolean {
  if (!cachedAt) {
    return false;
  }
  return Date.now() - cachedAt.getTime() < ttlMs;
}

export async function getCachedWalletBalances(wallet: Wallet): Promise<{
  onChainUsdt: number;
  pendingInboundUsdt: number;
  fromCache: boolean;
}> {
  if (
    isWalletBalanceCacheFresh(wallet.onChainUsdtCachedAt) &&
    wallet.onChainUsdtCached != null
  ) {
    return {
      onChainUsdt: wallet.onChainUsdtCached,
      pendingInboundUsdt: wallet.pendingInboundCached ?? 0,
      fromCache: true,
    };
  }

  if (!(await tron.validateAddress(wallet.address))) {
    return { onChainUsdt: 0, pendingInboundUsdt: 0, fromCache: false };
  }

  const [onChainUsdt, pendingInboundUsdt] = await Promise.all([
    tron.getUsdtBalance(wallet.address),
    tron.getPendingIncomingUsdtTotal(wallet.address),
  ]);

  await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      onChainUsdtCached: onChainUsdt,
      onChainUsdtCachedAt: new Date(),
      pendingInboundCached: pendingInboundUsdt,
    },
  });

  return { onChainUsdt, pendingInboundUsdt, fromCache: false };
}
