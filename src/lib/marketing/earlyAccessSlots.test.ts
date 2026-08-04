import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EARLY_ACCESS_ANCHOR_REMAINING,
  getEarlyAccessSlotsRemaining,
} from "./earlyAccessSlots";

describe("getEarlyAccessSlotsRemaining", () => {
  it("returns 174 on the anchor day (2026-08-04 UTC)", () => {
    assert.equal(
      getEarlyAccessSlotsRemaining(new Date("2026-08-04T00:00:00.000Z")),
      EARLY_ACCESS_ANCHOR_REMAINING
    );
    assert.equal(
      getEarlyAccessSlotsRemaining(new Date("2026-08-04T23:59:59.999Z")),
      174
    );
  });

  it("decreases by 2 per calendar day", () => {
    assert.equal(
      getEarlyAccessSlotsRemaining(new Date("2026-08-05T12:00:00.000Z")),
      172
    );
    assert.equal(
      getEarlyAccessSlotsRemaining(new Date("2026-08-06T12:00:00.000Z")),
      170
    );
  });

  it("floors at 0 after slots are exhausted", () => {
    // 174 / 2 = 87 days → day 87 = 0
    assert.equal(
      getEarlyAccessSlotsRemaining(new Date("2026-10-30T12:00:00.000Z")),
      0
    );
    assert.equal(
      getEarlyAccessSlotsRemaining(new Date("2026-11-12T12:00:00.000Z")),
      0
    );
  });

  it("does not increase before the anchor day", () => {
    assert.equal(
      getEarlyAccessSlotsRemaining(new Date("2026-08-03T12:00:00.000Z")),
      174
    );
  });
});
