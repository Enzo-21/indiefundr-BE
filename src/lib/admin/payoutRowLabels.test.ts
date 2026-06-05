import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPayoutRowStatusLabel } from "./payoutRowLabels";

describe("formatPayoutRowStatusLabel", () => {
  it("maps paid statuses to completed", () => {
    assert.equal(formatPayoutRowStatusLabel("paid"), "completed");
    assert.equal(formatPayoutRowStatusLabel("paid_surplus"), "completed");
  });

  it("maps waiting states to waiting", () => {
    assert.equal(formatPayoutRowStatusLabel("ready"), "waiting");
    assert.equal(formatPayoutRowStatusLabel("waiting"), "waiting");
  });
});
