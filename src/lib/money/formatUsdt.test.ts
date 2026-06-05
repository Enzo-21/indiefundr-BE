import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatUsdtDisplay,
  formatUsdtDisplayOrDash,
  truncateUsdt,
} from "./formatUsdt";

describe("truncateUsdt", () => {
  it("truncates toward zero at 2 decimals", () => {
    assert.equal(truncateUsdt(9.995, 2), 9.99);
    assert.equal(truncateUsdt(6.666667, 2), 6.66);
    assert.equal(truncateUsdt(29.97, 2), 29.97);
  });

  it("corrects float noise for pool minus surplus", () => {
    assert.equal(truncateUsdt(46.25 - 16.26, 2), 29.99);
  });

  it("truncates at 4 decimals", () => {
    assert.equal(truncateUsdt(1.23456789, 4), 1.2345);
  });
});

describe("formatUsdtDisplay", () => {
  it("shows exact cents for pool minus surplus style values", () => {
    assert.equal(formatUsdtDisplay(30.01), "30.01");
    assert.equal(formatUsdtDisplay(9.99), "9.99");
  });

  it("does not round up like toFixed(2)", () => {
    assert.equal((6.666667).toFixed(2), "6.67");
    assert.equal(formatUsdtDisplay(6.666667), "6.66");
    assert.equal((10.009).toFixed(2), "10.01");
    assert.equal(formatUsdtDisplay(10.009), "10.00");
    assert.equal(formatUsdtDisplay(9.995), "9.99");
    assert.equal(formatUsdtDisplay(29.97), "29.97");
    assert.equal(formatUsdtDisplay(46.25 - 16.26), "29.99");
  });

  it("pads fractional digits", () => {
    assert.equal(formatUsdtDisplay(25), "25.00");
    assert.equal(formatUsdtDisplay(5.4), "5.40");
  });

  it("formats 4 decimal places", () => {
    assert.equal(formatUsdtDisplay(1.23456789, 4), "1.2345");
  });
});

describe("formatUsdtDisplayOrDash", () => {
  it("returns dash for nullish", () => {
    assert.equal(formatUsdtDisplayOrDash(null), "—");
    assert.equal(formatUsdtDisplayOrDash(undefined), "—");
  });

  it("formats finite numbers", () => {
    assert.equal(formatUsdtDisplayOrDash(9.995), "9.99");
  });
});
