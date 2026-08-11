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
    assert.equal(p.amountUsdt, 50);
    assert.equal(p.arsPerUsdt, 1500);
    assert.equal(p.baseArs, 75_000);
    assert.equal(p.priceWithMarkupArs, 79_500);
    assert.equal(p.mpFeeArs, 4_770);
    assert.equal(p.totalArs, 84_270);
    assert.equal(p.arsChargeScale, 1);
  });

  it("scales ARS to 35% on staging while keeping 50 USDT", () => {
    const p = buildUsdtPurchasePricing({
      arsPerUsdt: 1500,
      arsChargeScale: 0.35,
    });
    assert.equal(p.amountUsdt, 50);
    assert.equal(p.arsPerUsdt, 525);
    assert.equal(p.baseArs, 26_250);
    assert.equal(p.priceWithMarkupArs, 27_825);
    assert.equal(p.mpFeeArs, 1_669.5);
    assert.equal(p.totalArs, 29_494.5);
    assert.equal(p.arsChargeScale, 0.35);
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

  it("returns 0.35 for testnet staging", () => {
    assert.equal(
      getUsdtPurchaseArsChargeScale({
        BLOCKCHAIN_NETWORK: "testnet",
        DATABASE_URL: "mongodb://x/staging",
      }),
      0.35
    );
  });
});
