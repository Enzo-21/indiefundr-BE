import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeWithdrawableFromLedgerFields } from "./ledger";

describe("computeWithdrawableFromLedgerFields", () => {
  it("pool 40 surplus 9.99 → withdrawable 30.01", () => {
    const result = computeWithdrawableFromLedgerFields({
      poolAvailable: 40,
      treasurySurplus: 9.99,
    });
    assert.equal(result.poolLiquidity, 30.01);
    assert.equal(result.protectedRevenueAvailable, 30.01);
  });

  it("withdrawable is zero when surplus exceeds pool", () => {
    const result = computeWithdrawableFromLedgerFields({
      poolAvailable: 10,
      treasurySurplus: 15,
    });
    assert.equal(result.poolLiquidity, 0);
    assert.equal(result.protectedRevenueAvailable, 0);
  });
});
