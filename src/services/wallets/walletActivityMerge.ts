import type { ReferralRequisite } from "@/services/referrals/referralRequisites";
import type { PrincipalRecoveryInsights } from "./hydratePrincipalRecoveryInsights";
import type { TransactionInsights } from "./transactionInsights";

export type WalletActivityTx = {
  id: string;
  type: string;
  source: string;
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
  withdrawalOrderId?: string | null;
  senderAddress?: string | null;
  recipientAddress?: string | null;
  referralRequisites?: ReferralRequisite[];
  referralMeta?: {
    perspective: "invitee" | "inviter";
    counterpartyDisplayName: string;
    referralCode?: string;
  };
  principalRecoveryInsights?: PrincipalRecoveryInsights;
};

function mergeOnChainFields(
  chosen: WalletActivityTx,
  other: WalletActivityTx
): WalletActivityTx {
  const topUpTxId = chosen.topUpTxId ?? other.topUpTxId ?? null;
  return {
    ...chosen,
    txId: chosen.txId ?? other.txId ?? null,
    tronscanUrl: chosen.tronscanUrl ?? other.tronscanUrl ?? null,
    topUpTxId,
    topUpTronscanUrl:
      chosen.topUpTronscanUrl ?? other.topUpTronscanUrl ?? null,
  };
}

function effectiveStatus(tx: WalletActivityTx): string {
  return (tx.displayStatus ?? tx.status).toLowerCase();
}

function activityStatusRank(status: string): number {
  const normalized = status.toLowerCase();
  if (normalized === "failed") return 0;
  if (normalized === "pending") return 1;
  return 2;
}

function isStalePendingFund(tx: WalletActivityTx): boolean {
  return isFundActivityTx(tx) && effectiveStatus(tx) === "pending";
}

function isConfirmedLike(tx: WalletActivityTx): boolean {
  return effectiveStatus(tx) === "confirmed";
}

export function upgradeActivityTxWithChainStatus(
  tx: WalletActivityTx,
  chainStatus: string
): WalletActivityTx {
  if (chainStatus.toLowerCase() !== "confirmed") {
    return tx;
  }
  // Purchase orders use resolvePurchaseOrderActivityDisplayStatus; chain confirm
  // alone must not show "completed" before admin marks successful.
  if (tx.id.startsWith("purchase-order-")) {
    return tx;
  }
  if (effectiveStatus(tx) === "pending") {
    return { ...tx, status: "confirmed", displayStatus: "confirmed" };
  }
  return tx;
}

export function isFundActivityTx(tx: WalletActivityTx): boolean {
  if (tx.source !== "app") {
    return false;
  }
  return (
    tx.id.startsWith("investment-") ||
    tx.id.startsWith("purchase-order-") ||
    tx.id.startsWith("redemption-") ||
    tx.id.startsWith("failed-investment-")
  );
}

/** Prefer memo/chain row for labels and status; keep fund insights from the DB index when present. */
export function mergeMemoActivityWithDbMatch(
  memoTx: WalletActivityTx,
  dbMatch: WalletActivityTx
): WalletActivityTx {
  const chosen = preferWalletActivityTx(dbMatch, memoTx);
  return mergeOnChainFields(
    {
      ...chosen,
      insights: memoTx.insights ?? dbMatch.insights,
      pendingTapInfo: memoTx.pendingTapInfo ?? dbMatch.pendingTapInfo,
      displayStatus:
        chosen.displayStatus ?? memoTx.displayStatus ?? dbMatch.displayStatus,
      settlementPhase: memoTx.settlementPhase ?? dbMatch.settlementPhase,
      settlementLabel: memoTx.settlementLabel ?? dbMatch.settlementLabel,
    },
    memoTx.topUpTxId ? memoTx : dbMatch
  );
}

export function preferWalletActivityTx(
  existing: WalletActivityTx,
  incoming: WalletActivityTx
): WalletActivityTx {
  if (isConfirmedLike(incoming) && isStalePendingFund(existing)) {
    return mergeOnChainFields(
      { ...incoming, insights: incoming.insights ?? existing.insights },
      existing
    );
  }
  if (isConfirmedLike(existing) && isStalePendingFund(incoming)) {
    return mergeOnChainFields(
      { ...existing, insights: existing.insights ?? incoming.insights },
      incoming
    );
  }

  const existingRank = activityStatusRank(effectiveStatus(existing));
  const incomingRank = activityStatusRank(effectiveStatus(incoming));
  if (incomingRank !== existingRank) {
    const chosen = incomingRank > existingRank ? incoming : existing;
    const other = incomingRank > existingRank ? existing : incoming;
    return mergeOnChainFields(
      { ...chosen, insights: chosen.insights ?? other.insights },
      other
    );
  }

  const existingIsFailedInv = existing.id.startsWith("failed-investment-");
  const incomingIsFailedInv = incoming.id.startsWith("failed-investment-");
  if (existingIsFailedInv && incoming.id.startsWith("purchase-order-")) {
    return mergeOnChainFields(incoming, existing);
  }
  if (incomingIsFailedInv && existing.id.startsWith("purchase-order-")) {
    return mergeOnChainFields(existing, incoming);
  }

  if (existing.source === "chain" && incoming.source === "app") {
    return mergeOnChainFields(
      { ...incoming, insights: incoming.insights ?? existing.insights },
      existing
    );
  }

  return mergeOnChainFields(
    { ...existing, insights: existing.insights ?? incoming.insights },
    incoming
  );
}

export function mergeWalletActivityTransaction(
  merged: Map<string, WalletActivityTx>,
  tx: WalletActivityTx
): void {
  if (tx.txId && merged.has(tx.txId)) {
    const existing = merged.get(tx.txId)!;
    merged.set(tx.txId, preferWalletActivityTx(existing, tx));
    return;
  }

  const key = tx.txId || tx.id;
  if (!merged.has(key)) {
    merged.set(key, tx);
  }
}

export function collectTxIdsFromActivity(
  transactions: WalletActivityTx[]
): Set<string> {
  const ids = new Set<string>();
  for (const tx of transactions) {
    if (tx.txId) {
      ids.add(tx.txId);
    }
  }
  return ids;
}

export function filterChainActivityByKnownTxIds(
  chainTransactions: WalletActivityTx[],
  knownTxIds: ReadonlySet<string>
): WalletActivityTx[] {
  if (knownTxIds.size === 0) {
    return chainTransactions;
  }
  return chainTransactions.filter(
    (tx) => !tx.txId || !knownTxIds.has(tx.txId)
  );
}
