import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { subscribeBodySchema } from "./funds";

describe("subscribeBodySchema", () => {
  it("accepts null device (no push token)", () => {
    const result = subscribeBodySchema.safeParse({
      fundId: "aggressive-alpha",
      cost: 25,
      device: null,
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.device, undefined);
    }
  });

  it("accepts omitted device", () => {
    const result = subscribeBodySchema.safeParse({
      fundId: "aggressive-alpha",
      cost: 25,
    });
    assert.equal(result.success, true);
  });
});
