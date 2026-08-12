import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runMarketplaceWaterfallSimulation,
  SIM_APP_FEE_PCT,
  SIM_WATERFALL_PRINCIPAL_ARS,
} from "./marketplaceWaterfallSimulation";

describe("marketplaceWaterfallSimulation", () => {
  it("keeps 10% app fee and bootstraps first ticket to float", () => {
    const { events, summary } = runMarketplaceWaterfallSimulation({
      perFund: 1,
      seed: 1,
    });

    assert.equal(SIM_WATERFALL_PRINCIPAL_ARS, 100_000);
    assert.equal(SIM_APP_FEE_PCT, 10);
    assert.equal(summary.investmentCount, 5);
    assert.equal(summary.appFeeTotal, 5 * 10_000);

    const firstFloat = events.find(
      (e) =>
        e.event === "float_credit" &&
        e.fromLabel === "Investment1" &&
        e.notes.includes("Bootstrap")
    );
    assert.ok(firstFloat);
    assert.equal(firstFloat!.amountArs, 90_000);

    // Right after bootstrap, Investment1 has not received user splits yet
    // (paid_to_date still 0 on the float_credit row).
    assert.equal(firstFloat!.headPaidToDate, 0);
  });

  it("waterfalls later tickets FIFO to earlier unpaid heads", () => {
    const { events } = runMarketplaceWaterfallSimulation({
      perFund: 1,
      seed: 1,
    });

    const splitsFrom2 = events.filter(
      (e) => e.event === "split" && e.fromLabel === "Investment2"
    );
    assert.equal(splitsFrom2.length, 1);
    assert.equal(splitsFrom2[0]!.toLabel, "Investment1");
    assert.equal(splitsFrom2[0]!.amountArs, 90_000);

    // Investment3 should finish Investment1 (Capital Shield 106k) then spill to Investment2
    const splitsFrom3 = events.filter(
      (e) => e.event === "split" && e.fromLabel === "Investment3"
    );
    assert.ok(splitsFrom3.length >= 1);
    assert.equal(splitsFrom3[0]!.toLabel, "Investment1");
    assert.equal(splitsFrom3[0]!.amountArs, 16_000);
    const closed1 = events.find(
      (e) => e.event === "payout_closed" && e.toLabel === "Investment1"
    );
    assert.ok(closed1);
  });

  it("runs 200 mixed tickets at 100k with 10% app fee", () => {
    const { summary, investments } = runMarketplaceWaterfallSimulation({
      perFund: 40,
      seed: 100_010,
    });

    assert.equal(summary.investmentCount, 200);
    assert.equal(summary.grossSubscribed, 20_000_000);
    assert.equal(summary.appFeeTotal, 2_000_000);
    assert.equal(summary.distributableTotal, 18_000_000);
    assert.equal(
      summary.splitToUsersTotal + summary.floatCreditedTotal,
      summary.distributableTotal
    );
    assert.equal(summary.totalPaidToUsers, summary.splitToUsersTotal);
    assert.ok(investments.every((inv) => inv.principalArs === 100_000));
    assert.ok(summary.openObligationTotal >= 0);
  });
});
