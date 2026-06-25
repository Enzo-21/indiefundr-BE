import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  protectedRevenueForAmount,
  surplusPerSubscription,
  triadSurplusForPayout,
  unlockPrincipalRequired,
  unlockSlotEquivalent,
} from "./investmentCohort";

describe("investmentCohort", () => {
  it("unlockPrincipalRequired is 2× head amount", () => {
    assert.equal(unlockPrincipalRequired(25), 50);
    assert.equal(unlockPrincipalRequired(50), 100);
  });

  it("unlockSlotEquivalent compares unlocker to head cohort", () => {
    assert.equal(unlockSlotEquivalent(50, 25), 2);
    assert.equal(unlockSlotEquivalent(75, 50), 1.5);
  });

  it("protectedRevenue scales proportionally with principal", () => {
    assert.equal(protectedRevenueForAmount(25), 10);
    assert.equal(protectedRevenueForAmount(50), 20);
  });

  it("surplusPerSubscription scales with investment amount (Aggressive 40%)", () => {
    const at25 = surplusPerSubscription(35, 25);
    const at50 = surplusPerSubscription(70, 50);
    assert.ok(at25 > 0);
    assert.equal(at50, at25 * 2);
  });

  it("triadSurplusForPayout at 25 matches legacy Aggressive example", () => {
    assert.equal(triadSurplusForPayout(35, 25), 10);
  });
});
