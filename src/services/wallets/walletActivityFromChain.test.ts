import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPortfolioLightPoll } from "./investmentPortfolio";

describe("wallet activity poll sources", () => {
  it("only home-pending is a light poll source", () => {
    assert.equal(isPortfolioLightPoll("home-pending"), true);
    assert.equal(isPortfolioLightPoll(undefined), false);
    assert.equal(isPortfolioLightPoll("manual-refresh"), false);
  });
});
