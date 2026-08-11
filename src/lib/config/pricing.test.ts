import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getInvestmentAmountUsdtForLevel,
  isValidInvestmentAmount,
} from "./pricing";

describe("pricing", () => {
  it("maps player level to investment amount", () => {
    assert.equal(getInvestmentAmountUsdtForLevel(0), 50);
    assert.equal(getInvestmentAmountUsdtForLevel(1), 50);
    assert.equal(getInvestmentAmountUsdtForLevel(2), 100);
    assert.equal(getInvestmentAmountUsdtForLevel(3), 150);
    assert.equal(getInvestmentAmountUsdtForLevel(4), 150);
    assert.equal(getInvestmentAmountUsdtForLevel(5), 200);
    assert.equal(getInvestmentAmountUsdtForLevel(99), 200);
  });

  it("validates amount against player level", () => {
    assert.equal(isValidInvestmentAmount(50, 0), true);
    assert.equal(isValidInvestmentAmount(100, 0), false);
    assert.equal(isValidInvestmentAmount(100, 2), true);
    assert.equal(isValidInvestmentAmount(50, 2), false);
    assert.equal(isValidInvestmentAmount(200, 5), true);
    assert.equal(isValidInvestmentAmount(150, 5), false);
  });
});
