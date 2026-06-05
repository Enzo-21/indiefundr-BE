import assert from "node:assert/strict";
import { InvestmentStatus } from "@prisma/client";
import { describe, it } from "node:test";
import { computeInvestedBreakdown, isPortfolioLightPoll } from "./investmentPortfolio";

describe("isPortfolioLightPoll", () => {
  it("is true for home pending polls", () => {
    assert.equal(isPortfolioLightPoll("home-pending"), true);
  });

  it("is false for initial load and other sources", () => {
    assert.equal(isPortfolioLightPoll(undefined), false);
    assert.equal(isPortfolioLightPoll(""), false);
    assert.equal(isPortfolioLightPoll("manual-refresh"), false);
  });
});

describe("computeInvestedBreakdown available balance inputs", () => {
  it("matches on-chain when USDT already broadcast for processing order", () => {
    const onChainUsdt = 10;
    const breakdown = computeInvestedBreakdown(
      [
        {
          id: "order-4",
          costUsdt: 25,
          usdtTxId: "tx-sent",
        },
      ],
      [
        {
          id: "inv1",
          amountUsdt: 25,
          status: InvestmentStatus.active,
        } as import("@prisma/client").Investment,
        {
          id: "inv2",
          amountUsdt: 25,
          status: InvestmentStatus.active,
        } as import("@prisma/client").Investment,
        {
          id: "inv3",
          amountUsdt: 25,
          status: InvestmentStatus.active,
        } as import("@prisma/client").Investment,
        {
          id: "inv4",
          amountUsdt: 25,
          status: InvestmentStatus.pending,
          purchaseOrderId: "order-4",
        } as import("@prisma/client").Investment,
      ]
    );
    const availableUsdt = Math.max(
      0,
      onChainUsdt - breakdown.pendingOrdersInvested
    );
    assert.equal(breakdown.pendingOrdersInvested, 0);
    assert.equal(breakdown.activeInvestments, 75);
    assert.equal(breakdown.pendingInvestments, 25);
    assert.equal(availableUsdt, 10);
  });
});
