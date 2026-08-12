import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { protectedRevenueForAmount } from "@/lib/config/investmentCohort";
import {
  projectedPayoutForFund,
  runMixedFunds50TrxSimulation,
  SIM_PRINCIPAL_USDT,
  SIM_TRX_PER_TRANSFER,
  SIM_TRX_PRICE_USD,
} from "./mixedFunds50TrxSimulation";

describe("mixedFunds50TrxSimulation", () => {
  it("uses 50 USDT tickets and known fund payouts", () => {
    assert.equal(SIM_PRINCIPAL_USDT, 50);
    assert.equal(projectedPayoutForFund(50, 40), 70);
    assert.equal(projectedPayoutForFund(50, 25), 62.5);
    assert.equal(projectedPayoutForFund(50, 15), 57.5);
    assert.equal(projectedPayoutForFund(50, 10), 55);
    assert.equal(projectedPayoutForFund(50, 6), 53);
  });

  it("runs 200 mixed subs at ticket 50 with TRX costs", () => {
    const { summary, investments } = runMixedFunds50TrxSimulation({
      perFund: 40,
      seed: 50,
      includeWithdrawals: true,
    });

    assert.equal(summary.investmentCount, 200);
    assert.equal(summary.grossSubscribed, 10_000);
    assert.equal(summary.principalUsdt, 50);
    assert.ok(investments.every((inv) => inv.amountUsdt === 50));
    assert.equal(
      summary.protectedRevenueCredited,
      200 * protectedRevenueForAmount(50)
    );

    const paid = summary.triadPayouts + summary.surplusPayouts;
    const expectedTransfers =
      200 + paid * 2; /* invest + payout + withdraw per paid */
    assert.equal(summary.trxTransfers, expectedTransfers);
    assert.equal(summary.trxBurned, expectedTransfers * SIM_TRX_PER_TRANSFER);
    assert.equal(
      summary.trxCostUsdt,
      Number((summary.trxBurned * SIM_TRX_PRICE_USD).toFixed(2))
    );
    assert.ok(summary.poolAvailable >= 0);
    assert.ok(summary.treasurySurplus >= 0);
  });
});
