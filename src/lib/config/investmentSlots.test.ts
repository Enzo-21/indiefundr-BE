import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMaxOpenInvestmentsForFund,
  InvestmentSlotsFullError,
} from "./investmentSlots";

describe("investment slot helpers", () => {
  it("returns per-fund maxOpenInvestments from catalog", () => {
    assert.equal(getMaxOpenInvestmentsForFund("aggressive-alpha"), 5);
    assert.equal(getMaxOpenInvestmentsForFund("capital-shield"), 5);
  });

  it("falls back to 1 for unknown funds", () => {
    assert.equal(getMaxOpenInvestmentsForFund("unknown-fund"), 1);
  });

  it("InvestmentSlotsFullError exposes code and counts", () => {
    const err = new InvestmentSlotsFullError(5, 5);
    assert.equal(err.code, "SLOTS_FULL");
    assert.equal(err.openCount, 5);
    assert.equal(err.maxOpenInvestments, 5);
    assert.match(err.message, /5\/5/);
  });
});
