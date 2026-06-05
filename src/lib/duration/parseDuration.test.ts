import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDuration,
  durationToApproxDays,
  parseDuration,
  subtractDuration,
} from "./parseDuration";

describe("parseDuration", () => {
  it("parses supported units", () => {
    assert.deepEqual(parseDuration("90D"), { amount: 90, unit: "D" });
    assert.deepEqual(parseDuration("45d"), { amount: 45, unit: "D" });
    assert.deepEqual(parseDuration("2W"), { amount: 2, unit: "W" });
    assert.deepEqual(parseDuration("12H"), { amount: 12, unit: "H" });
    assert.deepEqual(parseDuration("30Mi"), { amount: 30, unit: "Mi" });
    assert.deepEqual(parseDuration("3Mo"), { amount: 3, unit: "Mo" });
    assert.deepEqual(parseDuration("3.5D"), { amount: 3.5, unit: "D" });
  });

  it("rejects invalid specs", () => {
    assert.throws(() => parseDuration("90"), /Invalid duration/);
    assert.throws(() => parseDuration("90X"), /Invalid duration/);
    assert.throws(() => parseDuration(""), /Invalid duration/);
  });
});

describe("addDuration / subtractDuration", () => {
  const base = new Date("2026-01-01T12:00:00.000Z");

  it("adds days, weeks, hours, minutes", () => {
    assert.equal(
      addDuration(base, "7D").toISOString(),
      "2026-01-08T12:00:00.000Z"
    );
    assert.equal(
      addDuration(base, "2W").toISOString(),
      "2026-01-15T12:00:00.000Z"
    );
    assert.equal(
      addDuration(base, "6H").toISOString(),
      "2026-01-01T18:00:00.000Z"
    );
    assert.equal(
      addDuration(base, "90Mi").toISOString(),
      "2026-01-01T13:30:00.000Z"
    );
  });

  it("adds fractional days", () => {
    assert.equal(
      addDuration(base, "3.5D").toISOString(),
      "2026-01-05T00:00:00.000Z"
    );
  });

  it("adds calendar months", () => {
    assert.equal(
      addDuration(base, "1Mo").toISOString(),
      "2026-02-01T12:00:00.000Z"
    );
  });

  it("subtracts before maturity window", () => {
    const maturesAt = new Date("2026-06-01T00:00:00.000Z");
    assert.equal(
      subtractDuration(maturesAt, "7D").toISOString(),
      "2026-05-25T00:00:00.000Z"
    );
  });
});

describe("durationToApproxDays", () => {
  it("converts units for display", () => {
    assert.equal(durationToApproxDays("90D"), 90);
    assert.equal(durationToApproxDays("2W"), 14);
    assert.equal(durationToApproxDays("48H"), 2);
    assert.equal(durationToApproxDays("3Mo"), 90);
  });
});
