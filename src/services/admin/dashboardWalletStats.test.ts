import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  balanceFromCachedWallet,
  buildWalletSyncMeta,
  chainTransferToClassifyInput,
  computeUserWalletStatsFromDb,
} from "./dashboardWalletStats";
import type { UserWalletStatsContext } from "./userWalletStats";

const ctx: UserWalletStatsContext = {
  treasuryAddress: "TTREASURY",
  userWalletAddresses: new Set(["TUSER1"]),
  walletByAddress: new Map([["TUSER1", { userId: "user-1" }]]),
  addressesByUserId: new Map([["user-1", new Set(["TUSER1"])]]),
  orderByTxId: new Set(),
  redemptionByTxId: new Set(),
};

describe("dashboardWalletStats", () => {
  it("subtracts pending inbound from cached balance", () => {
    assert.equal(
      balanceFromCachedWallet({
        onChainUsdtCached: 100,
        pendingInboundCached: 12.5,
      }),
      87.5
    );
  });

  it("classifies external deposits from chain transfer rows", () => {
    const stats = computeUserWalletStatsFromDb(
      "user-1",
      [
        {
          id: "wallet-1",
          userId: "user-1",
          address: "TUSER1",
          isMainWallet: true,
          date: new Date("2026-01-01"),
          onChainUsdtCached: 50,
          onChainUsdtCachedAt: new Date(),
          pendingInboundCached: 0,
        },
      ],
      new Map([
        [
          "wallet-1",
          [
            {
              walletId: "wallet-1",
              txId: "tx-deposit",
              type: "in",
              amountUsdt: 25,
              status: "confirmed",
              raw: { from: "TEXTERNAL", to: "TUSER1" },
            },
          ],
        ],
      ]),
      new Map([["wallet-1", "TUSER1"]]),
      ctx
    );

    assert.equal(stats.totalDeposited, 25);
    assert.equal(stats.hasFundedWallet, true);
    assert.equal(stats.currentBalance, 50);
  });

  it("marks sync meta stale when cache timestamps are missing", () => {
    const meta = buildWalletSyncMeta([
      {
        id: "wallet-1",
        userId: "user-1",
        address: "TUSER1",
        isMainWallet: true,
        date: new Date(),
        onChainUsdtCached: null,
        onChainUsdtCachedAt: null,
        pendingInboundCached: null,
      },
    ]);

    assert.equal(meta.isStale, true);
    assert.equal(meta.staleWalletCount, 1);
    assert.equal(meta.lastSyncedAt, null);
  });

  it("parses classify input from stored chain transfer raw payload", () => {
    const input = chainTransferToClassifyInput(
      {
        walletId: "wallet-1",
        txId: "tx-1",
        type: "out",
        amountUsdt: 10,
        status: "confirmed",
        raw: { from: "TUSER1", to: "TEXTERNAL" },
      },
      "TUSER1"
    );

    assert.equal(input.from, "TUSER1");
    assert.equal(input.to, "TEXTERNAL");
    assert.equal(input.type, "out");
  });
});
