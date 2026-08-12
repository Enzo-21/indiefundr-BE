import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { protectedRevenueForAmount } from "@/lib/config/investmentCohort";
import {
  cohortSurplusForPayout,
  findUnlockingInvestmentsN,
  runMixedFundsMpArsSimulation,
  SIM_IIBB_PCT,
  SIM_MP_IN_FEE_PCT,
  SIM_MP_OUT_FEE_PCT,
  SIM_PRINCIPAL_ARS,
  SIM_UNLOCKERS_REQUIRED,
  surplusPerSubscriptionArs,
} from "./mixedFundsMpArsSimulation";

describe("mixedFundsMpArsSimulation", () => {
  it("uses 100k ARS tickets and 3 unlockers", () => {
    assert.equal(SIM_PRINCIPAL_ARS, 100_000);
    assert.equal(SIM_UNLOCKERS_REQUIRED, 3);
    assert.equal(
      cohortSurplusForPayout(140_000, 100_000, 3),
      400_000 - 4 * protectedRevenueForAmount(100_000) - 140_000
    );
  });

  it("credits surplus per subscription over 4 cohort legs", () => {
    const slice = surplusPerSubscriptionArs(140_000, 100_000, 3);
    assert.equal(
      slice,
      Math.trunc((cohortSurplusForPayout(140_000, 100_000, 3) / 4) * 100) / 100
    );
  });

  it("requires three later investments to unlock", () => {
    const start = Date.UTC(2026, 0, 1);
    const head = {
      id: "h",
      userId: "u0",
      subscribedAt: new Date(start),
      amountUsdt: 100_000,
      projectedPayoutUsdt: 140_000,
      excludedFromTriadUnlock: false,
    };
    const later = [1, 2, 3].map((n) => ({
      id: `u${n}`,
      userId: `user-${n}`,
      subscribedAt: new Date(start + n * 60_000),
      amountUsdt: 100_000,
      projectedPayoutUsdt: 140_000,
      excludedFromTriadUnlock: false,
    }));
    assert.equal(findUnlockingInvestmentsN(head, later.slice(0, 2)).length, 0);
    assert.equal(findUnlockingInvestmentsN(head, later).length, 3);
  });

  it("runs 200 mixed subs at 100k ARS with MP + tax cost tracking", () => {
    const { summary, investments, events } = runMixedFundsMpArsSimulation({
      perFund: 40,
      seed: 100_000,
    });

    assert.equal(summary.investmentCount, 200);
    assert.equal(summary.principalArs, 100_000);
    assert.equal(summary.unlockersRequired, 3);
    assert.equal(summary.grossSubscribed, 20_000_000);
    assert.ok(investments.every((inv) => inv.amountUsdt === 100_000));

    const expectedMpIn = 200 * 100_000 * (SIM_MP_IN_FEE_PCT / 100);
    const expectedIibb = Math.trunc(200 * 100_000 * (SIM_IIBB_PCT / 100) * 100) / 100;
    assert.equal(summary.mpFeeInTotal, expectedMpIn);
    assert.equal(summary.iibbTotal, expectedIibb);
    assert.equal(
      summary.netReceivedAfterMpIn,
      summary.grossSubscribed - summary.mpFeeInTotal
    );
    assert.equal(
      summary.protectedRevenueCredited,
      200 * protectedRevenueForAmount(100_000)
    );
    assert.ok(summary.gananciasTotal > 0);
    assert.ok(summary.mpFeeOutUserTotal > 0);
    assert.equal(
      summary.platformCostTotal,
      summary.mpFeeInTotal + summary.iibbTotal + summary.gananciasTotal
    );
    assert.ok(summary.poolAvailable >= 0);
    assert.ok(summary.treasurySurplus >= 0);

    const sub = events.find((e) => e.event === "subscription");
    assert.ok(sub);
    assert.ok(sub!.notes.includes("MP in"));
    assert.ok(sub!.notes.includes("IIBB"));

    const payout = events.find((e) => e.event === "payout");
    if (payout) {
      assert.ok(payout.notes.includes("absorbed by user"));
      assert.ok(payout.notes.includes(`${SIM_MP_OUT_FEE_PCT}%`));
    }
  });
});
