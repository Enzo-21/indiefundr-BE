import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APP_NET_REVENUE_PER_SUBSCRIBER_USDT,
  INVESTMENT_AMOUNT_USDT,
  roundUsdt,
} from "@/lib/config/revenueEngine";
import {
  fieldsMismatch,
  LEDGER_RECONCILE_EPSILON,
  type LedgerIntegrityReport,
  type ExpectedLedgerValues,
} from "./ledgerReconcile";
import {
  buildSequentialCohort,
  cohortToExpectedLedger,
  projectCohortLedger,
  simulatePayoutReadinessUnlocks,
  surplusPerSubscription,
} from "./triadSimulation";
import {
  loadAggressiveAlphaSimulationCsv,
  replaySimulationCsv,
} from "./simulateLedgerFromCsv";

describe("fieldsMismatch", () => {
  it("returns false when stored matches expected within epsilon", () => {
    const values: ExpectedLedgerValues = {
      poolAvailable: 25,
      treasurySurplus: 0,
      protectedRevenueWithdrawn: 0,
    };
    assert.equal(fieldsMismatch(values, { ...values }), false);
  });

  it("returns true when pool differs beyond epsilon", () => {
    const stored: ExpectedLedgerValues = {
      poolAvailable: 73.5,
      treasurySurplus: 0,
      protectedRevenueWithdrawn: 10,
    };
    const expected: ExpectedLedgerValues = {
      poolAvailable: 0,
      treasurySurplus: 0,
      protectedRevenueWithdrawn: 0,
    };
    assert.equal(fieldsMismatch(stored, expected), true);
  });
});

describe("LEDGER_RECONCILE_EPSILON", () => {
  it("is small enough for USDT comparisons", () => {
    assert.ok(LEDGER_RECONCILE_EPSILON < 0.01);
  });
});

describe("expected ledger math", () => {
  it("uses positive env-configured USDT constants", () => {
    assert.ok(INVESTMENT_AMOUNT_USDT() > 0);
    assert.ok(APP_NET_REVENUE_PER_SUBSCRIBER_USDT() > 0);
  });

  it("roundUsdt stabilizes float comparisons", () => {
    assert.equal(roundUsdt(0.1 + 0.2), 0.3);
  });

  it("detects treasury surplus mismatches", () => {
    const report = {
      stored: {
        poolAvailable: 40,
        treasurySurplus: 0,
        protectedRevenueWithdrawn: 0,
      },
      expected: {
        poolAvailable: 40,
        treasurySurplus: 10,
        protectedRevenueWithdrawn: 0,
      },
    } as Pick<LedgerIntegrityReport, "stored" | "expected">;

    assert.equal(fieldsMismatch(report.stored, report.expected), true);
  });

  it("expected pool subtracts withdrawal totals after payouts", () => {
    const subscriptions = 19;
    const payoutTotal = 237.5;
    const withdrawalTotal = 180;
    let poolAvailable = subscriptions * INVESTMENT_AMOUNT_USDT();
    poolAvailable -= payoutTotal;
    poolAvailable -= withdrawalTotal;
    poolAvailable = roundUsdt(Math.max(0, poolAvailable));
    assert.equal(poolAvailable, 57.5);
  });

  it("closed 100-user Aggressive cohort matches computeExpectedLedger formulas", () => {
    const n = 100;
    const payoutPerHead = 35;
    const unlocks = simulatePayoutReadinessUnlocks(
      buildSequentialCohort(n, { payoutUsdt: payoutPerHead })
    );
    const projection = projectCohortLedger({
      investmentCount: n,
      payoutPerHead,
    });
    const expected = cohortToExpectedLedger(projection);

    assert.equal(unlocks.length, projection.triadCount);
    const csvFinal = replaySimulationCsv(loadAggressiveAlphaSimulationCsv()).at(-1);
    assert.ok(csvFinal);
    assert.equal(expected.poolAvailable, csvFinal.poolAvailable);
    assert.equal(csvFinal.poolAvailable, 785);
    assert.equal(csvFinal.treasurySurplus, 18);
    assert.equal(
      expected.treasurySurplus,
      roundUsdt(n * surplusPerSubscription(payoutPerHead, INVESTMENT_AMOUNT_USDT()))
    );
    assert.equal(
      expected.poolAvailable,
      roundUsdt(n * INVESTMENT_AMOUNT_USDT() - projection.totalPayouts)
    );
  });

  it("9-user cohort projection matches triad unlock simulation", () => {
    const n = 9;
    const unlocks = simulatePayoutReadinessUnlocks(
      buildSequentialCohort(n, { payoutUsdt: 35 })
    );
    const projection = projectCohortLedger({
      investmentCount: n,
      payoutPerHead: 35,
    });
    const expected = cohortToExpectedLedger(projection);

    assert.equal(unlocks.length, 4);
    assert.equal(projection.totalPayouts, 140);
    assert.equal(
      expected.treasurySurplus,
      roundUsdt(n * surplusPerSubscription(35, INVESTMENT_AMOUNT_USDT()))
    );
    assert.equal(expected.poolAvailable, 85);
  });

  it("detects duplicate subscription ledger drift", () => {
    const stored: ExpectedLedgerValues = {
      poolAvailable: 80,
      treasurySurplus: 20,
      protectedRevenueWithdrawn: 0,
    };
    const expected: ExpectedLedgerValues = {
      poolAvailable: 55,
      treasurySurplus: 20,
      protectedRevenueWithdrawn: 0,
    };

    assert.equal(fieldsMismatch(stored, expected), true);
  });
});
