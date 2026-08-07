import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUsdtPurchasePricing } from "./usdtPurchasePricing";

describe("buildUsdtPurchasePricing", () => {
  it("applies hidden markup then visible MP fee", () => {
    const p = buildUsdtPurchasePricing();
    assert.equal(p.amountUsdt, 25);
    assert.equal(p.arsPerUsdt, 1500);
    assert.equal(p.baseArs, 37_500);
    assert.equal(p.priceWithMarkupArs, 39_750);
    assert.equal(p.mpFeeArs, 2_385);
    assert.equal(p.totalArs, 42_135);
  });
});
