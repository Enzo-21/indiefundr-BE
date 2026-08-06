import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCountryInput } from "./country";

describe("normalizeCountryInput", () => {
  it("accepts null and empty as null", () => {
    assert.deepEqual(normalizeCountryInput(null), { ok: true, country: null });
    assert.deepEqual(normalizeCountryInput(""), { ok: true, country: null });
    assert.deepEqual(normalizeCountryInput("  "), { ok: true, country: null });
  });

  it("uppercases valid ISO alpha-2 codes", () => {
    assert.deepEqual(normalizeCountryInput("ar"), { ok: true, country: "AR" });
    assert.deepEqual(normalizeCountryInput("US"), { ok: true, country: "US" });
  });

  it("rejects invalid values", () => {
    assert.equal(normalizeCountryInput(12).ok, false);
    assert.equal(normalizeCountryInput("USA").ok, false);
    assert.equal(normalizeCountryInput("A").ok, false);
  });
});
