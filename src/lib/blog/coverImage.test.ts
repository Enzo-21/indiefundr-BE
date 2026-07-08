import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverObjectPosition } from "./coverImage";

describe("coverObjectPosition", () => {
  it("returns a CSS object-position value", () => {
    assert.equal(coverObjectPosition(35), "center 35%");
  });

  it("clamps values outside 0-100", () => {
    assert.equal(coverObjectPosition(-10), "center 0%");
    assert.equal(coverObjectPosition(150), "center 100%");
  });
});
