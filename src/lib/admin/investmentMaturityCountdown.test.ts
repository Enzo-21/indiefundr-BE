import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvestmentStatus } from "@prisma/client";
import { shouldShowInvestmentMaturityCountdown } from "./investmentMaturityCountdown";

const maturesAt = new Date("2026-01-01T00:00:00.000Z");

describe("shouldShowInvestmentMaturityCountdown", () => {
  it("shows only for matured unpaid investments", () => {
    assert.equal(
      shouldShowInvestmentMaturityCountdown({
        status: InvestmentStatus.matured,
        maturesAt,
      }),
      true
    );
  });

  it("hides for paid or in-flight payouts", () => {
    for (const status of [
      InvestmentStatus.redeemed,
      InvestmentStatus.referral_recovered,
      InvestmentStatus.redeeming,
    ]) {
      assert.equal(
        shouldShowInvestmentMaturityCountdown({ status, maturesAt }),
        false
      );
    }
  });

  it("hides for investments still active or pending", () => {
    for (const status of [InvestmentStatus.active, InvestmentStatus.pending]) {
      assert.equal(
        shouldShowInvestmentMaturityCountdown({ status, maturesAt }),
        false
      );
    }
  });

  it("returns false without maturesAt", () => {
    assert.equal(
      shouldShowInvestmentMaturityCountdown({
        status: InvestmentStatus.matured,
        maturesAt: null,
      }),
      false
    );
  });
});
