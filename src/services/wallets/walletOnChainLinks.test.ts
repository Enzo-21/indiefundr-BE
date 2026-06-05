import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  linksFromInvestment,
  linksFromPurchaseOrder,
  mergeOnChainLinks,
} from "./walletOnChainLinks";

describe("walletOnChainLinks", () => {
  it("linksFromPurchaseOrder exposes USDT and TRX top-up hashes", () => {
    const links = linksFromPurchaseOrder({
      usdtTxId: "usdt-hash-abc",
      topUpTxId: "trx-hash-xyz",
    });
    assert.equal(links.txId, "usdt-hash-abc");
    assert.ok(links.tronscanUrl?.includes("usdt-hash-abc"));
    assert.equal(links.topUpTxId, "trx-hash-xyz");
    assert.ok(links.topUpTronscanUrl?.includes("trx-hash-xyz"));
  });

  it("linksFromInvestment prefers order USDT and includes top-up", () => {
    const links = linksFromInvestment(
      { transaction: { txID: "inv-only" }, purchaseOrderId: "ord-1" },
      { usdtTxId: "usdt-from-order", topUpTxId: "trx-topup" }
    );
    assert.equal(links.txId, "usdt-from-order");
    assert.equal(links.topUpTxId, "trx-topup");
  });

  it("mergeOnChainLinks fills missing fields from fallback", () => {
    const merged = mergeOnChainLinks(
      { txId: "usdt-1", tronscanUrl: null, topUpTxId: null, topUpTronscanUrl: null },
      { topUpTxId: "trx-1", topUpTronscanUrl: "https://example/trx-1" }
    );
    assert.equal(merged.txId, "usdt-1");
    assert.equal(merged.topUpTxId, "trx-1");
    assert.equal(merged.topUpTronscanUrl, "https://example/trx-1");
  });
});
