import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTreasuryLedgerHints } from "./ledgerDisplay";

describe("buildTreasuryLedgerHints", () => {
  it("describes pool and withdrawable as pool minus surplus", () => {
    const hints = buildTreasuryLedgerHints({
      poolAvailable: 40,
      treasurySurplus: 9.99,
      poolLiquidity: 30.01,
      protectedRevenueAvailable: 30.01,
    });

    assert.ok(
      hints.protectedRevenueAvailable.some((line) =>
        line.includes("pool − treasury surplus")
      )
    );
    assert.ok(
      hints.protectedRevenueAvailable.some((line) =>
        line.includes("simulation CSV")
      )
    );
    assert.ok(
      hints.treasurySurplus.some((line) => line.includes("triad surplus ÷ 3"))
    );
    assert.ok(
      hints.poolAvailable.some((line) => line.includes("subscription"))
    );
  });
});
