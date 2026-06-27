import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COHORT_REFERENCE_INVESTMENT_USDT } from "@/lib/config/investmentCohort";
import { roundUsdt } from "@/lib/config/revenueEngine";
import { syncUnrecordedAppWithdrawalsFromAudit } from "./withdrawals";

describe("syncUnrecordedAppWithdrawalsFromAudit", () => {
  it("records only audit rows not already in ledger withdrawals", async () => {
    const recorded: Array<{ amountUsdt: number; txRef?: string; note?: string }> =
      [];

    const result = await syncUnrecordedAppWithdrawalsFromAudit(
      async (input) => {
        recorded.push(input);
        return { withdrawal: {} as never, ledger: {} as never };
      },
      {
        loadRecordedTxIds: async () => new Set(["tx-existing"]),
        loadCandidates: async () => [
          { txId: "tx-a", amountUsdt: 10, detail: "First" },
          { txId: "tx-existing", amountUsdt: 5, detail: "Skip" },
          { txId: "tx-b", amountUsdt: 20, detail: "Second" },
        ],
      }
    );

    assert.equal(result.recorded, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.failed.length, 0);
    assert.equal(recorded.length, 2);
    assert.equal(recorded[0]?.amountUsdt, 10);
    assert.equal(recorded[0]?.txRef, "tx-a");
    assert.equal(recorded[1]?.amountUsdt, 20);
    assert.equal(recorded[1]?.txRef, "tx-b");
  });

  it("audit sync query only includes ledger-linked treasury_app_withdrawal rows", async () => {
    const { AUDIT_APP_WITHDRAWAL_SYNC_WHERE } = await import("./withdrawals");
    assert.equal(AUDIT_APP_WITHDRAWAL_SYNC_WHERE.classificationSource, "app_tx");
    assert.equal(AUDIT_APP_WITHDRAWAL_SYNC_WHERE.category, "treasury_app_withdrawal");
  });

  it("collects failures without stopping later rows", async () => {
    const result = await syncUnrecordedAppWithdrawalsFromAudit(
      async (input) => {
        if (input.txRef === "tx-bad") {
          throw new Error("Insufficient protected revenue");
        }
        return { withdrawal: {} as never, ledger: {} as never };
      },
      {
        loadRecordedTxIds: async () => new Set(),
        loadCandidates: async () => [
          { txId: "tx-ok", amountUsdt: 10, detail: null },
          { txId: "tx-bad", amountUsdt: 180, detail: null },
          { txId: "tx-after", amountUsdt: 10, detail: null },
        ],
      }
    );

    assert.equal(result.recorded, 2);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0]?.txId, "tx-bad");
  });
});

describe("withdrawal pool math", () => {
  it("reduces pool by withdrawal total after payouts", () => {
    const subscriptions = 19;
    const payoutTotal = 237.5;
    const withdrawalTotal = 180;
    const gross = subscriptions * COHORT_REFERENCE_INVESTMENT_USDT;
    const poolAfterPayouts = roundUsdt(Math.max(0, gross - payoutTotal));
    const poolAfterWithdrawal = roundUsdt(
      Math.max(0, poolAfterPayouts - withdrawalTotal)
    );
    assert.equal(poolAfterPayouts, 237.5);
    assert.equal(poolAfterWithdrawal, 57.5);
  });
});
