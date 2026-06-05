import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultTypicalPayoutDays,
  typicalPayoutDaysFromSamples,
  TYPICAL_PAYOUT_MIN_SAMPLES,
} from "./typicalPayoutDays";

function sample(
  subscribedAt: Date,
  redeemedAt: Date
): { subscribedAt: Date; date: Date; redeemedAt: Date } {
  return { subscribedAt, date: subscribedAt, redeemedAt };
}

describe("typicalPayoutDays", () => {
  it("defaultTypicalPayoutDays uses half term plus 10%", () => {
    assert.equal(defaultTypicalPayoutDays(100), 55);
    assert.equal(defaultTypicalPayoutDays(90), 50);
    assert.equal(defaultTypicalPayoutDays(1), 1);
  });

  it("typicalPayoutDaysFromSamples uses default below threshold", () => {
    const samples = Array.from({ length: 99 }, (_, i) =>
      sample(
        new Date("2026-01-01T00:00:00.000Z"),
        new Date(`2026-01-${String(4 + (i % 5)).padStart(2, "0")}T00:00:00.000Z`)
      )
    );
    assert.equal(typicalPayoutDaysFromSamples(samples, 90), 50);
    assert.equal(samples.length, TYPICAL_PAYOUT_MIN_SAMPLES - 1);
  });

  it("typicalPayoutDaysFromSamples averages whole-day durations at threshold", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const samples = [
      ...Array.from({ length: 50 }, () =>
        sample(base, new Date("2026-01-04T00:00:00.000Z"))
      ),
      ...Array.from({ length: 50 }, () =>
        sample(base, new Date("2026-01-10T00:00:00.000Z"))
      ),
    ];
    assert.equal(typicalPayoutDaysFromSamples(samples, 90), 6);
  });

  it("typicalPayoutDaysFromSamples rounds fractional means", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const samples = [
      ...Array.from({ length: 50 }, () =>
        sample(base, new Date("2026-01-04T00:00:00.000Z"))
      ),
      ...Array.from({ length: 50 }, () =>
        sample(base, new Date("2026-01-11T00:00:00.000Z"))
      ),
    ];
    assert.equal(typicalPayoutDaysFromSamples(samples, 90), 7);
  });
});
