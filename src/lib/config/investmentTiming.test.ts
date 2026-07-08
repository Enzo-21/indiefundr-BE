import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDuration } from "@/lib/duration/parseDuration";
import { resetEnvCache } from "@/lib/env";
import {
  formatInvestmentTermHyphenated,
  formatInvestmentTermLabel,
  getDefaultInvestmentTerm,
  getInvestmentTermSpec,
  getMaturityDate,
  MAINNET_INVESTMENT_TERM,
  TESTNET_INVESTMENT_TERM,
} from "./investmentTiming";

describe("investmentTiming defaults", () => {
  it("formats term label for marketing copy", () => {
    assert.equal(formatInvestmentTermLabel(4), "4 days");
    assert.equal(formatInvestmentTermLabel(1), "1 day");
    assert.equal(formatInvestmentTermHyphenated(4), "4-day");
    assert.equal(formatInvestmentTermHyphenated(90), "90-day");
  });

  it("uses testnet term when BLOCKCHAIN_NETWORK is testnet", () => {
    resetEnvCache();
    process.env.BLOCKCHAIN_NETWORK = "testnet";
    delete process.env.INVESTMENT_TERM;

    assert.equal(getDefaultInvestmentTerm(), TESTNET_INVESTMENT_TERM);
    assert.equal(getInvestmentTermSpec(), TESTNET_INVESTMENT_TERM);

    const from = new Date("2026-01-01T00:00:00.000Z");
    assert.equal(
      getMaturityDate(from).toISOString(),
      addDuration(from, TESTNET_INVESTMENT_TERM).toISOString()
    );
  });

  it("uses mainnet term when BLOCKCHAIN_NETWORK is mainnet", () => {
    resetEnvCache();
    process.env.BLOCKCHAIN_NETWORK = "mainnet";
    delete process.env.INVESTMENT_TERM;

    assert.equal(getDefaultInvestmentTerm(), MAINNET_INVESTMENT_TERM);
    assert.equal(getInvestmentTermSpec(), MAINNET_INVESTMENT_TERM);

    const from = new Date("2026-01-01T00:00:00.000Z");
    assert.equal(
      getMaturityDate(from).toISOString(),
      addDuration(from, MAINNET_INVESTMENT_TERM).toISOString()
    );
  });

  it("INVESTMENT_TERM env overrides network default", () => {
    resetEnvCache();
    process.env.BLOCKCHAIN_NETWORK = "mainnet";
    process.env.INVESTMENT_TERM = "12H";

    assert.equal(getInvestmentTermSpec(), "12H");
  });
});
