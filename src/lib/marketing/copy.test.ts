import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetEnvCache } from "@/lib/env";
import { buildMarketingCopy } from "./copy";

describe("buildMarketingCopy", () => {
  it("uses 90-day copy when BLOCKCHAIN_NETWORK is mainnet", () => {
    resetEnvCache();
    process.env.BLOCKCHAIN_NETWORK = "mainnet";
    delete process.env.INVESTMENT_TERM;

    const copy = buildMarketingCopy();

    assert.equal(copy.investmentTermDays, 90);
    assert.match(copy.heroCopy.eyebrow, /90 days/);
    assert.match(copy.featuresCopy.title, /90 days each/);
    assert.match(copy.howItWorksCopy.steps[1]?.description ?? "", /90 days/);
    assert.match(copy.faqCopy.items[0]?.answer ?? "", /90-day/);
  });

  it("uses 3-day copy when BLOCKCHAIN_NETWORK is testnet", () => {
    resetEnvCache();
    process.env.BLOCKCHAIN_NETWORK = "testnet";
    delete process.env.INVESTMENT_TERM;

    const copy = buildMarketingCopy();

    assert.equal(copy.investmentTermDays, 3);
    assert.match(copy.heroCopy.eyebrow, /3 days/);
    assert.match(copy.featuresCopy.title, /3 days each/);
    assert.match(copy.howItWorksCopy.steps[1]?.description ?? "", /3 days/);
    assert.match(copy.faqCopy.items[0]?.answer ?? "", /3-day/);
  });
});
