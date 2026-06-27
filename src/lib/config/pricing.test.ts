import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getInvestmentAmountUsdtForLevel,
  isValidInvestmentAmount,
} from "./pricing";

describe("pricing", () => {
  it("maps player level to investment amount", () => {
    assert.equal(getInvestmentAmountUsdtForLevel(0), 25);
    assert.equal(getInvestmentAmountUsdtForLevel(1), 25);
    assert.equal(getInvestmentAmountUsdtForLevel(2), 50);
    assert.equal(getInvestmentAmountUsdtForLevel(3), 75);
    assert.equal(getInvestmentAmountUsdtForLevel(4), 75);
    assert.equal(getInvestmentAmountUsdtForLevel(5), 100);
    assert.equal(getInvestmentAmountUsdtForLevel(99), 100);
  });

  it("validates amount against player level", () => {
    assert.equal(isValidInvestmentAmount(25, 0), true);
    assert.equal(isValidInvestmentAmount(50, 0), false);
    assert.equal(isValidInvestmentAmount(50, 2), true);
    assert.equal(isValidInvestmentAmount(25, 2), false);
    assert.equal(isValidInvestmentAmount(100, 5), true);
    assert.equal(isValidInvestmentAmount(75, 5), false);
  });
});
