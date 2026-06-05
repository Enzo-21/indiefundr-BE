import assert from "node:assert/strict";
import { describe, it, mock, after } from "node:test";
import type { Wallet } from "@prisma/client";

const USER_ID = "507f1f77bcf86cd799439011";
const WALLET_ID = "507f1f77bcf86cd799439014";

const mockEnv = {
  walletActivityChainLimit: 50,
  walletActivityStatusConcurrency: 2,
  walletActivityLimit: 100,
  walletSyncStaleMs: 60_000,
  treasuryAddress: "",
  deferInvestmentUntilConfirm: false,
};

function makeWallet(): Wallet {
  return {
    id: WALLET_ID,
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

describe("resolveWalletActivityFromChain fallback", () => {
  after(() => {
    mock.restoreAll();
  });

  it("returns chainHistoryError and materialized rows when chain read fails", async () => {
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
        },
        GLOBAL_LEDGER_ID: "global",
      },
    });
    mock.module("@/services/tron/client", {
      namedExports: {
        getTrc20UsdtTransfers: async () => {
          throw new Error("tron unavailable");
        },
        enrichTrc20TransferStatuses: async (rows: unknown[]) => rows,
        getTransactionMemosBatch: async () => new Map(),
        getTxId: () => null,
      },
    });

    const { resolveWalletActivityFromChain } = await import(
      "./walletActivityFromChain"
    );

    const payload = await resolveWalletActivityFromChain(USER_ID, makeWallet());

    assert.equal(payload.chainHistoryError, true);
    assert.equal(payload.syncing, false);
    assert.deepEqual(payload.transactions, []);
  });
});
