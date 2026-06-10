import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampExtensionDays,
  extensionBounds,
  maxExtensionDays,
  UNPAID_MATURITY_EXTENSION_MIN_DAYS,
} from "./unpaidMaturityChoice";

describe("unpaidMaturityChoice config", () => {
  it("maxExtensionDays is half the fund term", () => {
    assert.equal(maxExtensionDays(90), 45);
    assert.equal(maxExtensionDays(200), 100);
  });

  it("extensionBounds uses 7-day minimum and half-term maximum", () => {
    const ninety = extensionBounds(90);
    assert.equal(ninety.minDays, UNPAID_MATURITY_EXTENSION_MIN_DAYS);
    assert.equal(ninety.maxDays, 45);

    const twoHundred = extensionBounds(200);
    assert.equal(twoHundred.minDays, 7);
    assert.equal(twoHundred.maxDays, 100);
  });

  it("clampExtensionDays accepts in-range integers only", () => {
    assert.equal(clampExtensionDays(90, 7), 7);
    assert.equal(clampExtensionDays(90, 45), 45);
    assert.equal(clampExtensionDays(90, 6), null);
    assert.equal(clampExtensionDays(90, 46), null);
    assert.equal(clampExtensionDays(90, 7.5), null);
  });
});
