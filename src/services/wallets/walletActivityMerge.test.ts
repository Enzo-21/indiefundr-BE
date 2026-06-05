import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeMemoActivityWithDbMatch,
  upgradeActivityTxWithChainStatus,
} from "./walletActivityMerge";

describe("mergeMemoActivityWithDbMatch", () => {
  it("keeps fund insights from the DB index when the memo row has none", () => {
    const insights = {
      kind: "investment" as const,
      fundId: "growth",
      fundName: "Growth",
      principalUsdt: 25,
      projectedPayoutUsdt: 31.25,
      targetReturnPercent: 25,
      expectedEarningsUsdt: 6.25,
      maxTermDays: 90,
      typicalPayoutDays: 7,
      subscribedAt: null,
      maturesAt: null,
      redeemedAt: null,
      payoutDaysElapsed: null,
      creditedUsdt: null,
      investmentId: null,
      purchaseOrderId: null,
    };
    const dbMatch = {
      id: "investment-inv-1",
      type: "out",
      source: "app",
      amount: 25,
      status: "confirmed",
      label: "Investment order (Growth)",
      date: new Date(),
      txId: "tx-abc",
      tronscanUrl: null,
      insights,
    };
    const memoTx = {
      id: "purchase-order-ord-1",
      type: "out",
      source: "app",
      amount: 25,
      status: "confirmed",
      label: "Investment order (Growth)",
      date: new Date(),
      txId: "tx-abc",
      tronscanUrl: null,
    };
    const merged = mergeMemoActivityWithDbMatch(memoTx, dbMatch);
    assert.deepEqual(merged.insights, insights);
    assert.equal(merged.id, "investment-inv-1");
  });
});

describe("upgradeActivityTxWithChainStatus", () => {
  it("keeps purchase-order pending when chain row is confirmed", () => {
    const tx = {
      id: "purchase-order-ord-1",
      type: "out",
      source: "app",
      amount: 25,
      status: "pending",
      displayStatus: "pending",
      label: "Investment order (Balanced Growth)",
      date: new Date(),
      txId: "tx-abc",
      tronscanUrl: null,
    };
    const upgraded = upgradeActivityTxWithChainStatus(tx, "confirmed");
    assert.equal(upgraded.status, "pending");
    assert.equal(upgraded.displayStatus, "pending");
  });

  it("still upgrades generic chain rows from pending to confirmed", () => {
    const tx = {
      id: "chain-tx-1",
      type: "in",
      source: "chain",
      amount: 100,
      status: "pending",
      label: "USDT received",
      date: new Date(),
      txId: "chain-tx-1",
      tronscanUrl: null,
    };
    const upgraded = upgradeActivityTxWithChainStatus(tx, "confirmed");
    assert.equal(upgraded.status, "confirmed");
    assert.equal(upgraded.displayStatus, "confirmed");
  });
});
