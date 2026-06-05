import type { WalletActivityTx } from "./walletActivityMerge";

export type WalletActivitySyncMeta = {
  lastSyncedAt: string | null;
  chainSyncedThroughAt: string | null;
  stale: boolean;
};

export type WalletTransactionsPayload = {
  transactions: WalletActivityTx[];
  chainHistoryError: boolean;
  syncing: boolean;
  sync: WalletActivitySyncMeta;
  nextCursor: string | null;
  hasMore: boolean;
};

export type WalletActivitySyncStatusPayload = {
  syncing: boolean;
  sync: WalletActivitySyncMeta;
};
