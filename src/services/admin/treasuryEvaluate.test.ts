import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

describe("runAdminTreasuryReconcile", () => {
  it("delegates to reconcileTreasuryLedgerFromExpected", async () => {
    mock.module("@/services/revenueEngine/ledgerReconcile", {
      namedExports: {
        reconcileTreasuryLedgerFromExpected: async () => ({
          updated: true,
          stored: {
            poolAvailable: 10,
            treasurySurplus: 5,
            protectedRevenueWithdrawn: 0,
          },
          expected: {
            poolAvailable: 25,
            treasurySurplus: 5,
            protectedRevenueWithdrawn: 0,
          },
          deltas: {
            poolAvailable: 15,
            treasurySurplus: 0,
            protectedRevenueWithdrawn: 0,
          },
          adjustedFields: ["poolAvailable"],
        }),
      },
    });

    const { runAdminTreasuryReconcile } = await import("./treasuryEvaluate");
    const result = await runAdminTreasuryReconcile();

    assert.equal(result.updated, true);
    assert.deepEqual(result.adjustedFields, ["poolAvailable"]);
  });
});
