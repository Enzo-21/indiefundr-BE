import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("referralCode", () => {
  it("buildShareUrl encodes code", async () => {
    const { buildShareUrl } = await import("./referralCode");
    const url = buildShareUrl("INDIE4X2");
    assert.match(url, /invite\?code=INDIE4X2/);
  });
});
