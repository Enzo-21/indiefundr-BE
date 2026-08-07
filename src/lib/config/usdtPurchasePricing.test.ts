import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUsdtPurchasePricing,
  getUsdtPurchaseArsChargeScale,
} from "./usdtPurchasePricing";

describe("buildUsdtPurchasePricing", () => {
  it("applies hidden markup then visible MP fee at full scale", () => {
    const p = buildUsdtPurchasePricing({
      arsPerUsdt: 1500,
      arsChargeScale: 1,
    });
    assert.equal(p.amountUsdt, 25);
    assert.equal(p.arsPerUsdt, 1500);
    assert.equal(p.baseArs, 37_500);
    assert.equal(p.priceWithMarkupArs, 39_750);
    assert.equal(p.mpFeeArs, 2_385);
    assert.equal(p.totalArs, 42_135);
    assert.equal(p.arsChargeScale, 1);
  });

  it("scales ARS to 10% on staging while keeping 25 USDT", () => {
    const p = buildUsdtPurchasePricing({
      arsPerUsdt: 1500,
      arsChargeScale: 0.1,
    });
    assert.equal(p.amountUsdt, 25);
    assert.equal(p.arsPerUsdt, 150);
    assert.equal(p.baseArs, 3750);
    assert.equal(p.priceWithMarkupArs, 3975);
    assert.equal(p.mpFeeArs, 238.5);
    assert.equal(p.totalArs, 4213.5);
    assert.equal(p.arsChargeScale, 0.1);
  });

  it("rejects non-positive arsPerUsdt", () => {
    assert.throws(() =>
      buildUsdtPurchasePricing({ arsPerUsdt: 0, arsChargeScale: 1 })
    );
  });
});

describe("getUsdtPurchaseArsChargeScale", () => {
  it("returns 1 for mainnet / production DB", () => {
    assert.equal(
      getUsdtPurchaseArsChargeScale({
        BLOCKCHAIN_NETWORK: "mainnet",
        DATABASE_URL: "mongodb://x/staging",
      }),
      1
    );
    assert.equal(
      getUsdtPurchaseArsChargeScale({
        BLOCKCHAIN_NETWORK: "testnet",
        DATABASE_URL: "mongodb://x/production",
      }),
      1
    );
  });

  it("returns 0.1 for testnet staging", () => {
    assert.equal(
      getUsdtPurchaseArsChargeScale({
        BLOCKCHAIN_NETWORK: "testnet",
        DATABASE_URL: "mongodb://x/staging",
      }),
      0.1
    );
  });
});
