import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_NET_REVENUE_PER_SUBSCRIBER_USDT } from "@/lib/config/revenueEngine";
import {
  calculateTriadPayoutAccountingFromInvestments,
  surplusPerSubscription,
  triadSurplusForPayout,
} from "./accounting";
import { triadSurplusForPayout as cohortTriadSurplus } from "@/lib/config/investmentCohort";

const baseInvestment = {
  id: "paid",
  userId: "user-a",
  amountUsdt: 25,
  projectedPayoutUsdt: 35,
  payoutUnlockingInvestmentIds: ["unlock-b", "unlock-c"],
  payoutUnlockingUserIds: ["user-b", "user-c"],
};

describe("triad payout accounting", () => {
  it("surplusPerSubscription is one third of triad surplus at 2dp", () => {
    assert.equal(cohortTriadSurplus(35, 25), 10);
    assert.equal(triadSurplusForPayout(35, 25), 10);
    assert.equal(surplusPerSubscription(35, 25), 3.33);
  });

  it("high-risk triad produces 10 USDT surplus", () => {
    const accounting = calculateTriadPayoutAccountingFromInvestments(
      baseInvestment,
      [
        { id: "unlock-b", userId: "user-b", amountUsdt: 25 },
        { id: "unlock-c", userId: "user-c", amountUsdt: 25 },
      ]
    );

    assert.equal(accounting.complete, true);
    assert.equal(accounting.grossTriadInflow, 75);
    assert.equal(accounting.protectedRevenueAmount, 30);
    assert.equal(accounting.payoutAmount, 35);
    assert.equal(accounting.triadSurplus, 10);
  });

  it("Growth Partners triad (31.25 payout) produces 13.75 USDT surplus", () => {
    const accounting = calculateTriadPayoutAccountingFromInvestments(
      { ...baseInvestment, projectedPayoutUsdt: 31.25 },
      [
        { id: "unlock-b", userId: "user-b", amountUsdt: 25 },
        { id: "unlock-c", userId: "user-c", amountUsdt: 25 },
      ]
    );

    assert.equal(accounting.complete, true);
    assert.equal(accounting.grossTriadInflow, 75);
    assert.equal(accounting.protectedRevenueAmount, 30);
    assert.equal(accounting.payoutAmount, 31.25);
    assert.equal(accounting.triadSurplus, 13.75);
  });

  it("lower-risk payout leaves larger surplus", () => {
    const accounting = calculateTriadPayoutAccountingFromInvestments(
      { ...baseInvestment, projectedPayoutUsdt: 26.5 },
      [
        { id: "unlock-b", userId: "user-b", amountUsdt: 25 },
        { id: "unlock-c", userId: "user-c", amountUsdt: 25 },
      ]
    );

    assert.equal(accounting.triadSurplus, 18.5);
  });

  it("missing unlocker ids produces no surplus and returns a warning", () => {
    const accounting = calculateTriadPayoutAccountingFromInvestments(
      baseInvestment,
      [{ id: "unlock-b", userId: "user-b", amountUsdt: 25 }]
    );

    assert.equal(accounting.complete, false);
    assert.equal(accounting.triadSurplus, 0);
    assert.deepEqual(accounting.missingUnlockingInvestmentIds, ["unlock-c"]);
    assert.ok(accounting.warning);
  });

  it("protected revenue remains 10 USDT per completed investment", () => {
    assert.equal(APP_NET_REVENUE_PER_SUBSCRIBER_USDT(), 10);
  });

  it("mixed cohort: one 50 USDT unlocker completes triad for 25 USDT head", () => {
    const accounting = calculateTriadPayoutAccountingFromInvestments(
      {
        ...baseInvestment,
        payoutUnlockingInvestmentIds: ["unlock-b"],
        payoutUnlockingUserIds: ["user-b"],
      },
      [{ id: "unlock-b", userId: "user-b", amountUsdt: 50 }]
    );

    assert.equal(accounting.complete, true);
    assert.equal(accounting.grossTriadInflow, 75);
    assert.equal(accounting.protectedRevenueAmount, 30);
    assert.equal(accounting.triadSurplus, 10);
  });
});
