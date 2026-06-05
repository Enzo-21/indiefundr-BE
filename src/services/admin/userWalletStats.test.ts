import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateTransferTotals,
  applyTransferToTotals,
  classifyUserTransfer,
  type UserWalletStatsContext,
} from "./userWalletStats";

function makeCtx(
  overrides: Partial<UserWalletStatsContext> = {}
): UserWalletStatsContext {
  return {
    treasuryAddress: "TTREASURY",
    userWalletAddresses: new Set(["TWALLET_A", "TWALLET_B", "TWALLET_C"]),
    walletByAddress: new Map([
      ["TWALLET_A", { userId: "user-a" }],
      ["TWALLET_B", { userId: "user-b" }],
      ["TWALLET_C", { userId: "user-a" }],
    ]),
    addressesByUserId: new Map([
      ["user-a", new Set(["TWALLET_A", "TWALLET_C"])],
      ["user-b", new Set(["TWALLET_B"])],
    ]),
    orderByTxId: new Set(["tx-invest-1"]),
    redemptionByTxId: new Set(["tx-redeem-1"]),
    ...overrides,
  };
}

describe("classifyUserTransfer", () => {
  const ctx = makeCtx();
  const userA = new Set(["TWALLET_A", "TWALLET_C"]);

  it("classifies external deposit", () => {
    assert.equal(
      classifyUserTransfer(
        {
          txId: "tx-ext-in",
          type: "in",
          from: "TEXTERNAL",
          to: "TWALLET_A",
        },
        "user-a",
        userA,
        ctx
      ),
      "external_deposit"
    );
  });

  it("classifies p2p inbound from another user wallet", () => {
    assert.equal(
      classifyUserTransfer(
        {
          txId: "tx-p2p",
          type: "in",
          from: "TWALLET_B",
          to: "TWALLET_A",
        },
        "user-a",
        userA,
        ctx
      ),
      "p2p_in"
    );
  });

  it("excludes treasury redemption from deposits", () => {
    assert.equal(
      classifyUserTransfer(
        {
          txId: "tx-redeem-1",
          type: "in",
          from: "TTREASURY",
          to: "TWALLET_A",
        },
        "user-a",
        userA,
        ctx
      ),
      "redemption"
    );
  });

  it("excludes invest payment to treasury from withdrawals", () => {
    assert.equal(
      classifyUserTransfer(
        {
          txId: "tx-invest-1",
          type: "out",
          from: "TWALLET_A",
          to: "TTREASURY",
        },
        "user-a",
        userA,
        ctx
      ),
      "invest_payment"
    );
  });

  it("classifies p2p outbound to another user wallet", () => {
    assert.equal(
      classifyUserTransfer(
        {
          txId: "tx-p2p-out",
          type: "out",
          from: "TWALLET_A",
          to: "TWALLET_B",
        },
        "user-a",
        userA,
        ctx
      ),
      "p2p_out"
    );
  });

  it("excludes self-transfer between wallets of same user", () => {
    assert.equal(
      classifyUserTransfer(
        {
          txId: "tx-self",
          type: "out",
          from: "TWALLET_A",
          to: "TWALLET_C",
        },
        "user-a",
        userA,
        ctx
      ),
      "self"
    );
    assert.equal(
      classifyUserTransfer(
        {
          txId: "tx-self",
          type: "in",
          from: "TWALLET_A",
          to: "TWALLET_C",
        },
        "user-a",
        userA,
        ctx
      ),
      "self"
    );
  });

  it("classifies external withdrawal", () => {
    assert.equal(
      classifyUserTransfer(
        {
          txId: "tx-ext-out",
          type: "out",
          from: "TWALLET_A",
          to: "TEXTERNAL",
        },
        "user-a",
        userA,
        ctx
      ),
      "external_withdrawal"
    );
  });
});

describe("aggregateTransferTotals", () => {
  it("sums confirmed deposits and withdrawals with tx dedupe", () => {
    const totals = aggregateTransferTotals([
      {
        txId: "tx1",
        category: "external_deposit",
        amount: 50,
        status: "confirmed",
      },
      {
        txId: "tx1",
        category: "external_deposit",
        amount: 50,
        status: "confirmed",
      },
      {
        txId: "tx2",
        category: "p2p_out",
        amount: 20,
        status: "confirmed",
      },
      {
        txId: "tx3",
        category: "external_deposit",
        amount: 30,
        status: "pending",
      },
      {
        txId: "tx4",
        category: "invest_payment",
        amount: 25,
        status: "confirmed",
      },
    ]);

    assert.equal(totals.totalDeposited, 50);
    assert.equal(totals.totalWithdrawn, 20);
  });

  it("applyTransferToTotals matches aggregate math", () => {
    const totals = { totalDeposited: 0, totalWithdrawn: 0 };
    applyTransferToTotals("external_deposit", 50, "confirmed", totals);
    applyTransferToTotals("p2p_in", 50, "confirmed", totals);
    applyTransferToTotals("invest_payment", 25, "confirmed", totals);
    assert.equal(totals.totalDeposited, 100);
    assert.equal(totals.totalWithdrawn, 0);
  });

  it("counts history rows preserved as confirmed during status lookup rate limits", () => {
    const totals = aggregateTransferTotals([
      {
        txId: "tx-confirmed-by-history",
        category: "external_deposit",
        amount: 25,
        status: "confirmed",
      },
      {
        txId: "tx-pending-live-transfer",
        category: "external_deposit",
        amount: 25,
        status: "pending",
      },
    ]);

    assert.equal(totals.totalDeposited, 25);
    assert.equal(totals.totalWithdrawn, 0);
  });
});
