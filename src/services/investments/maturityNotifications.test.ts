import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notifyMaturedInvestments } from "./maturityNotifications";

describe("notifyMaturedInvestments", () => {
  it("returns zero counts for an empty list", async () => {
    const result = await notifyMaturedInvestments([]);
    assert.deepEqual(result, { notifiedCount: 0, skippedNoDevice: 0 });
  });
});
