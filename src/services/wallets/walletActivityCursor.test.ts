import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampActivityPageLimit,
  decodeActivityCursor,
  encodeActivityCursor,
} from "./walletActivityCursor";

describe("walletActivityCursor", () => {
  it("clampActivityPageLimit defaults and caps", () => {
    assert.equal(clampActivityPageLimit(), 10);
    assert.equal(clampActivityPageLimit(25), 25);
    assert.equal(clampActivityPageLimit(999), 50);
    assert.equal(clampActivityPageLimit(0), 10);
  });

  it("encode and decode round-trip", () => {
    const occurredAt = new Date("2026-06-01T12:00:00.000Z");
    const id = "507f1f77bcf86cd799439011";
    const cursor = encodeActivityCursor(occurredAt, id);
    const decoded = decodeActivityCursor(cursor);
    assert.ok(decoded);
    assert.equal(decoded!.id, id);
    assert.equal(decoded!.occurredAt, occurredAt.toISOString());
  });

  it("decodeActivityCursor rejects invalid input", () => {
    assert.equal(decodeActivityCursor(""), null);
    assert.equal(decodeActivityCursor("not-valid"), null);
  });
});
