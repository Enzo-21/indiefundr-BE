import assert from "node:assert/strict";
import { describe, it, mock, after } from "node:test";
import type { Wallet } from "@prisma/client";

const USER_ID = "507f1f77bcf86cd799439011";
const WALLET_OK_ID = "507f1f77bcf86cd799439012";
const mockEnv = {
  walletActivityChainLimit: 50,
  walletActivityStatusConcurrency: 2,
  walletActivityLimit: 100,
  walletSyncStaleMs: 60_000,
  treasuryAddress: "",
  deferInvestmentUntilConfirm: false,
};

function makeWallet(id: string): Wallet {
  return {
    id,
    userId: USER_ID,
    name: "Test",
    address: "TTestAddress123456789012345678901234",
    privateKey: "key",
    isMainWallet: true,
    activationStatus: "ready",
    activitySyncedAt: new Date("2026-01-01"),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Wallet;
}

function registerMocks(tronImpl: {
  getTrc20UsdtTransfers: () => Promise<unknown[]>;
}) {
  mock.module("@/lib/env", {
    namedExports: { getEnv: () => mockEnv },
  });
  mock.module("@/lib/uiSnapshotLog", {
    namedExports: {
      uiSnapshotLog: () => {},
      slimWalletActivityTx: (tx: unknown) => tx,
    },
  });
  mock.module("@/services/wallets/walletSyncService", {
    namedExports: { syncWallet: async () => ({}) },
  });
  mock.module("@/lib/prisma", {
    namedExports: {
      prisma: {
        purchaseOrder: { findMany: async () => [] },
        investment: { findMany: async () => [] },
        failedInvestment: { findMany: async () => [] },
        walletActivity: { findMany: async () => [] },
        wallet: { findFirst: async () => makeWallet(WALLET_OK_ID) },
      },
      GLOBAL_LEDGER_ID: "global",
    },
  });
  mock.module("@/services/tron/client", {
    namedExports: {
      getTrc20UsdtTransfers: tronImpl.getTrc20UsdtTransfers,
      enrichTrc20TransferStatuses: async (rows: unknown[]) => rows,
      getTransactionMemosBatch: async () => new Map(),
      getTxId: () => null,
    },
  });
}

describe("resolveWalletActivityFromChain", () => {
  after(() => {
    mock.restoreAll();
  });

  it("returns payload when chain read succeeds", async () => {
    registerMocks({ getTrc20UsdtTransfers: async () => [] });

    const { resolveWalletActivityFromChain } = await import(
      "./walletActivityFromChain"
    );

    const payload = await resolveWalletActivityFromChain(
      USER_ID,
      makeWallet(WALLET_OK_ID)
    );

    assert.equal(payload.chainHistoryError, false);
    assert.equal(payload.syncing, false);
    assert.ok(Array.isArray(payload.transactions));
    assert.equal(typeof payload.sync.stale, "boolean");
  });
});
