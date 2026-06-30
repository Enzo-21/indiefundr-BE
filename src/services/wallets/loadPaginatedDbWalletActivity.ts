import {
  PurchaseOrderStatus,
  type PurchaseOrder,
  type WalletActivity,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { collectPaymentTxIdsFromOrder } from "@/services/tron/usdtPaymentChainTruth";
import {
  mergeWalletActivityTransaction,
  type WalletActivityTx,
} from "./walletActivityMerge";
import { walletActivityRecordToTx } from "./walletActivityMaterializer";
import { hydrateActivityInsightsBatch } from "./hydrateActivityInsights";
import { hydrateActivityOnChainLinksBatch } from "./hydrateActivityOnChainLinks";
import { hydrateReferralRequisitesBatch } from "./hydrateReferralRequisites";
import { hydrateReferralMetaBatch } from "./hydrateReferralMeta";
import { hydratePrincipalRecoveryInsightsBatch } from "./hydratePrincipalRecoveryInsights";
import { hydrateWithdrawalActivityMetaBatch } from "./hydrateWithdrawalActivityMeta";
import type { TransactionInsights } from "./transactionInsights";
import type { WalletOnChainLinks } from "./walletOnChainLinks";
import {
  decodeActivityCursor,
  encodeActivityCursor,
} from "./walletActivityCursor";

const RAW_BATCH_SIZE = 25;
const MAX_RAW_SCAN_ROWS = 500;

export const REFERRAL_ACTIVITY_KINDS = [
  "referral_bonus_pending",
  "referral_bonus_processing",
  "referral_bonus_credited",
  "referral_principal_recovery",
] as const;

export type WalletActivityScope = "all" | "referral";

export function buildActivityScopeFilter(scope: WalletActivityScope | undefined) {
  if (scope === "referral") {
    return { kind: { in: [...REFERRAL_ACTIVITY_KINDS] } };
  }
  return {};
}

export function buildSuccessPaymentTxIdsForTest(
  walletOrders: Array<{
    usdtTxId: string | null;
    failedUsdtTxIds: string[];
    paymentChainOutcome: string | null;
    status: PurchaseOrderStatus;
  }>
): Set<string> {
  const successPaymentTxIds = new Set<string>();
  for (const order of walletOrders) {
    if (order.paymentChainOutcome === "success") {
      for (const txId of collectPaymentTxIdsFromOrder(order as PurchaseOrder)) {
        successPaymentTxIds.add(txId);
      }
    }
    if (order.status === PurchaseOrderStatus.completed && order.usdtTxId) {
      successPaymentTxIds.add(order.usdtTxId);
    }
  }
  return successPaymentTxIds;
}

function buildCursorFilter(cursor: string | null | undefined) {
  const decoded = decodeActivityCursor(cursor);
  if (!decoded) {
    return {};
  }
  return {
    OR: [
      { occurredAt: { lt: new Date(decoded.occurredAt) } },
      {
        occurredAt: new Date(decoded.occurredAt),
        id: { lt: decoded.id },
      },
    ],
  };
}

export function rowToVisibleTx(
  row: WalletActivity,
  successPaymentTxIds: Set<string>,
  insightsByRow: Map<string, TransactionInsights>,
  onChainByRow: Map<string, WalletOnChainLinks | null>,
  withdrawalMetaByRow: Map<
    string,
    {
      withdrawalOrderId: string;
      senderAddress: string | null;
      recipientAddress: string;
    }
  > = new Map(),
  referralRequisitesByRow: Map<string, import("@/services/referrals/referralRequisites").ReferralRequisite[]> = new Map(),
  referralMetaByRow: Map<string, import("./hydrateReferralMeta").ReferralActivityMeta> = new Map(),
  principalRecoveryInsightsByRow: Map<
    string,
    import("./hydratePrincipalRecoveryInsights").PrincipalRecoveryInsights
  > = new Map()
): WalletActivityTx | null {
  if (
    row.status === "failed" &&
    row.txId &&
    successPaymentTxIds.has(row.txId)
  ) {
    return null;
  }
  const rowKey = row.entityId ? `${row.kind}:${row.entityId}` : null;
  const insights = rowKey ? insightsByRow.get(rowKey) : undefined;
  const onChain = rowKey ? onChainByRow.get(rowKey) : undefined;
  const withdrawalMeta = rowKey ? withdrawalMetaByRow.get(rowKey) : undefined;
  const referralRequisites = rowKey
    ? referralRequisitesByRow.get(rowKey)
    : undefined;
  const referralMeta = rowKey ? referralMetaByRow.get(rowKey) : undefined;
  const principalRecoveryInsights = rowKey
    ? principalRecoveryInsightsByRow.get(rowKey)
    : undefined;
  return walletActivityRecordToTx(
    row,
    insights,
    onChain,
    withdrawalMeta,
    referralRequisites,
    referralMeta,
    principalRecoveryInsights
  );
}

export async function loadPaginatedDbWalletActivity(
  userId: string,
  walletId: string,
  limit: number,
  cursor?: string | null,
  options?: {
    successPaymentTxIds?: Set<string>;
    activityScope?: WalletActivityScope;
  }
): Promise<{
  transactions: WalletActivityTx[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  let successPaymentTxIds = options?.successPaymentTxIds;
  if (!successPaymentTxIds) {
    const walletOrders = await prisma.purchaseOrder.findMany({
      where: { userId, walletId },
      select: {
        id: true,
        usdtTxId: true,
        failedUsdtTxIds: true,
        paymentChainOutcome: true,
        status: true,
      },
    });
    successPaymentTxIds = buildSuccessPaymentTxIdsForTest(walletOrders);
  }

  const scopeFilter = buildActivityScopeFilter(options?.activityScope);
  const merged = new Map<string, WalletActivityTx>();
  const txSourceRow = new Map<string, WalletActivity>();
  let cursorFilter = buildCursorFilter(cursor);
  let lastConsumedRow: WalletActivity | null = null;
  let hasMore = false;
  let rawScanned = 0;

  while (merged.size < limit && rawScanned < MAX_RAW_SCAN_ROWS) {
    const batchSize = Math.max(limit, RAW_BATCH_SIZE);
    const rows = await prisma.walletActivity.findMany({
      where: {
        userId,
        walletId,
        ...scopeFilter,
        ...cursorFilter,
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: batchSize + 1,
    });

    rawScanned += rows.length;
    const batchHasMore = rows.length > batchSize;
    const batchRows = batchHasMore ? rows.slice(0, batchSize) : rows;

    if (!batchRows.length) {
      hasMore = false;
      break;
    }

    const [
      insightsByRow,
      onChainByRow,
      withdrawalMetaByRow,
      referralRequisitesByRow,
      referralMetaByRow,
      principalRecoveryInsightsByRow,
    ] = await Promise.all([
        hydrateActivityInsightsBatch(userId, batchRows),
        hydrateActivityOnChainLinksBatch(userId, batchRows),
        hydrateWithdrawalActivityMetaBatch(userId, batchRows),
        hydrateReferralRequisitesBatch(userId, batchRows),
        hydrateReferralMetaBatch(userId, batchRows),
        hydratePrincipalRecoveryInsightsBatch(userId, batchRows),
      ]);

    let stoppedEarly = false;
    for (let i = 0; i < batchRows.length; i++) {
      const row = batchRows[i]!;
      lastConsumedRow = row;
      const tx = rowToVisibleTx(
        row,
        successPaymentTxIds,
        insightsByRow,
        onChainByRow,
        withdrawalMetaByRow,
        referralRequisitesByRow,
        referralMetaByRow,
        principalRecoveryInsightsByRow
      );
      if (tx) {
        mergeWalletActivityTransaction(merged, tx);
        const prior = txSourceRow.get(tx.id);
        if (
          !prior ||
          row.occurredAt < prior.occurredAt ||
          (row.occurredAt.getTime() === prior.occurredAt.getTime() &&
            row.id < prior.id)
        ) {
          txSourceRow.set(tx.id, row);
        }
      }
      if (merged.size >= limit) {
        const moreInBatch = i < batchRows.length - 1;
        hasMore = moreInBatch || batchHasMore;
        stoppedEarly = true;
        break;
      }
    }

    if (stoppedEarly) {
      break;
    }

    if (!batchHasMore) {
      hasMore = false;
      break;
    }

    const lastBatchRow = batchRows[batchRows.length - 1]!;
    cursorFilter = {
      OR: [
        { occurredAt: { lt: lastBatchRow.occurredAt } },
        {
          occurredAt: lastBatchRow.occurredAt,
          id: { lt: lastBatchRow.id },
        },
      ],
    };
    hasMore = true;
  }

  const transactions = Array.from(merged.values())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);

  const paginationRow = pickPaginationRowFromPage(
    transactions,
    txSourceRow,
    lastConsumedRow
  );

  return finalizePaginatedActivityResult(transactions, hasMore, paginationRow);
}

/** Cursor row = source of the oldest visible tx on this page (not last raw row scanned). */
export function pickPaginationRowFromPage(
  transactions: WalletActivityTx[],
  txSourceRow: Map<string, WalletActivity>,
  fallbackRow: WalletActivity | null
): WalletActivity | null {
  if (transactions.length === 0) {
    return null;
  }
  const oldestTx = transactions[transactions.length - 1]!;
  return txSourceRow.get(oldestTx.id) ?? fallbackRow;
}

export function finalizePaginatedActivityResult(
  transactions: WalletActivityTx[],
  hasMore: boolean,
  paginationRow: WalletActivity | null
): {
  transactions: WalletActivityTx[];
  nextCursor: string | null;
  hasMore: boolean;
} {
  if (transactions.length === 0) {
    return {
      transactions,
      nextCursor: null,
      hasMore: false,
    };
  }
  return {
    transactions,
    nextCursor:
      hasMore && paginationRow
        ? encodeActivityCursor(paginationRow.occurredAt, paginationRow.id)
        : null,
    hasMore,
  };
}
