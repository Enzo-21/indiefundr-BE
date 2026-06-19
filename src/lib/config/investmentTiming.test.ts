import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDuration } from "@/lib/duration/parseDuration";
import {
  DEFAULT_INVESTMENT_TERM,
  formatInvestmentTermHyphenated,
  formatInvestmentTermLabel,
  getMaturityDate,
} from "./investmentTiming";

describe("investmentTiming defaults", () => {
  it("formats term label for marketing copy", () => {
    assert.equal(formatInvestmentTermLabel(4), "4 days");
    assert.equal(formatInvestmentTermLabel(1), "1 day");
    assert.equal(formatInvestmentTermHyphenated(4), "4-day");
    assert.equal(formatInvestmentTermHyphenated(90), "90-day");
  });

  it("maturity is term after subscribe", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const maturesAt = getMaturityDate(from);
    assert.equal(
      maturesAt.toISOString(),
      addDuration(from, DEFAULT_INVESTMENT_TERM).toISOString()
    );
  });
});
