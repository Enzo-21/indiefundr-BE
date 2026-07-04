import assert from "node:assert/strict";
import { InvestmentStatus } from "@prisma/client";
import { describe, it } from "node:test";
import { computeInvestedBreakdown, buildPortfolioInvestmentPositions, isPortfolioLightPoll } from "./investmentPortfolio";

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

describe("buildPortfolioInvestmentPositions", () => {
  it("returns separate rows for same fund with different situations", () => {
    const investments = [
      {
        id: "inv-active",
        fundId: "balanced-growth",
        amountUsdt: 25,
        status: InvestmentStatus.active,
      },
      {
        id: "inv-matured",
        fundId: "balanced-growth",
        amountUsdt: 30,
        status: InvestmentStatus.matured,
      },
    ] as import("@prisma/client").Investment[];

    const enrichedById = new Map([
      [
        "inv-active",
        {
          fundName: "Hustle Collective",
          amountUsdt: 25,
          situation: "active" as const,
          statusLabel: "Active",
          statusDetail: "Your investment is active until its maturity date.",
        },
      ],
      [
        "inv-matured",
        {
          fundName: "Hustle Collective",
          amountUsdt: 30,
          situation: "choice_required" as const,
          statusLabel: "Choose next step",
          statusDetail: "Your term ended, but your projected payout isn't ready yet.",
        },
      ],
    ]);

    const positions = buildPortfolioInvestmentPositions(
      [],
      investments,
      enrichedById
    );

    assert.equal(positions.length, 2);
    assert.equal(positions[0].id, "inv-matured");
    assert.equal(positions[0].statusLabel, "Choose next step");
    assert.equal(positions[1].id, "inv-active");
    assert.equal(positions[1].statusLabel, "Active");
  });

  it("includes processing orders and skips duplicate pending investments", () => {
    const investments = [
      {
        id: "inv-pending",
        fundId: "balanced-growth",
        amountUsdt: 25,
        status: InvestmentStatus.pending,
      },
    ] as import("@prisma/client").Investment[];

    const enrichedById = new Map([
      [
        "inv-pending",
        {
          fundName: "Hustle Collective",
          amountUsdt: 25,
          situation: "pending" as const,
          statusLabel: "Processing",
          statusDetail: "Your investment order is being processed.",
        },
      ],
    ]);

    const positions = buildPortfolioInvestmentPositions(
      [
        {
          id: "order-1",
          fundId: "balanced-growth",
          costUsdt: 25,
          reservedUsdt: 25,
        },
      ],
      investments,
      enrichedById
    );

    assert.equal(positions.length, 1);
    assert.equal(positions[0].kind, "processing_order");
    assert.equal(positions[0].statusLabel, "Processing");
  });
});
