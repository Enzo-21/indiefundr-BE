import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCountdown } from "./countdown";

describe("getCountdown", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("formats long future times as days/hours", () => {
    const target = new Date("2026-01-04T06:00:00.000Z");
    const result = getCountdown(target, now);
    assert.equal(result.label, "in 3d 6h");
    assert.equal(result.tone, "neutral");
    assert.equal(result.isPast, false);
  });

  it("formats short future times as hh:mm:ss", () => {
    const target = new Date("2026-01-01T05:04:03.000Z");
    const result = getCountdown(target, now);
    assert.equal(result.label, "in 05:04:03");
    assert.equal(result.tone, "warning");
    assert.equal(result.isPast, false);
  });

  it("returns due for recent past targets", () => {
    const target = new Date("2025-12-31T23:59:30.000Z");
    const result = getCountdown(target, now);
    assert.equal(result.label, "due");
    assert.equal(result.tone, "danger");
    assert.equal(result.isPast, true);
  });

  it("returns elapsed age for older past targets", () => {
    const target = new Date("2025-12-30T20:00:00.000Z");
    const result = getCountdown(target, now);
    assert.equal(result.label, "1d 4h ago");
    assert.equal(result.tone, "danger");
    assert.equal(result.isPast, true);
  });
});
