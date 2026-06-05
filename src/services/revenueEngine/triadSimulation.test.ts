import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roundUsdt } from "@/lib/config/revenueEngine";
import {
  buildSequentialCohort,
  cohortToExpectedLedger,
  projectCohortLedger,
  simulatePayoutReadinessUnlocks,
  surplusPerSubscription,
  triadSurplusForPayout,
} from "./triadSimulation";

describe("triadSimulation", () => {
  it("Aggressive triad surplus is 10 USDT", () => {
    assert.equal(triadSurplusForPayout(35), 10);
  });

  it("Growth Partners triad surplus is 13.75 USDT", () => {
    assert.equal(triadSurplusForPayout(31.25), 13.75);
  });

  it("9-user sequential cohort unlocks 4 heads (orders 1–4)", () => {
    const cohort = buildSequentialCohort(9, { payoutUsdt: 35 });
    const unlocks = simulatePayoutReadinessUnlocks(cohort);

    assert.equal(unlocks.length, 4);
    assert.deepEqual(
      unlocks.map((row) => row.headId),
      ["inv-1", "inv-2", "inv-3", "inv-4"]
    );
    assert.deepEqual(unlocks[0]!.unlockerIds, ["inv-2", "inv-3"]);
    assert.deepEqual(unlocks[3]!.unlockerIds, ["inv-8", "inv-9"]);
  });

  it("100-user Aggressive cohort: 49 triads, pool 785, surplus on subscribe", () => {
    const cohort = buildSequentialCohort(100, { payoutUsdt: 35 });
    const unlocks = simulatePayoutReadinessUnlocks(cohort);
    const projection = projectCohortLedger({
      investmentCount: 100,
      payoutPerHead: 35,
    });
    const expected = cohortToExpectedLedger(projection);
    const surplusOnSubscribe = roundUsdt(100 * surplusPerSubscription(35));

    assert.equal(unlocks.length, 49);
    assert.equal(projection.triadCount, 49);
    assert.equal(projection.grossSubscribed, 2500);
    assert.equal(projection.totalPayouts, 1715);
    assert.equal(projection.totalSurplusCredited, surplusOnSubscribe);
    assert.equal(projection.protectedCredited, 1000);
    assert.equal(expected.poolAvailable, 785);
    assert.equal(expected.treasurySurplus, surplusOnSubscribe);
    assert.equal(
      roundUsdt(projection.grossSubscribed - projection.totalPayouts),
      expected.poolAvailable
    );
  });

  it("simulated unlock count matches floor((N-1)/2) for sequential cohorts", () => {
    for (const n of [3, 4, 9, 12, 100]) {
      const unlocks = simulatePayoutReadinessUnlocks(
        buildSequentialCohort(n, { payoutUsdt: 35 })
      );
      assert.equal(unlocks.length, Math.floor((n - 1) / 2));
    }
  });
});
