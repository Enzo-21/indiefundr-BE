import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { InvestmentStatus } from "@prisma/client";

describe("confirmInvestmentRedemption", () => {
  it("confirms or reports pending based on chain status", async () => {
    const investments: Record<
      string,
      {
        id: string;
        status: InvestmentStatus;
        fundId: string;
        projectedPayoutUsdt: number;
        payoutTriggeredBy: string;
        payoutUnlockedAt: Date;
        maturesAt: Date;
        redemptionTransaction: Record<string, string>;
      }
    > = {
      "inv-1": {
        id: "inv-1",
        status: InvestmentStatus.redeeming,
        fundId: "balanced-growth",
        projectedPayoutUsdt: 31.25,
        payoutTriggeredBy: "admin",
        payoutUnlockedAt: new Date(),
        maturesAt: new Date(),
        redemptionTransaction: { txID: "tx-abc" },
      },
      "inv-2": {
        id: "inv-2",
        status: InvestmentStatus.redeeming,
        fundId: "balanced-growth",
        projectedPayoutUsdt: 31.25,
        payoutTriggeredBy: "admin",
        payoutUnlockedAt: new Date(),
        maturesAt: new Date(),
        redemptionTransaction: { txID: "tx-pending" },
      },
    };

    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          investment: {
            findUnique: async ({
              where,
            }: {
              where: { id: string };
            }) => investments[where.id] ?? null,
            update: async ({
              where,
              data,
            }: {
              where: { id: string };
              data: { status: InvestmentStatus };
            }) => ({
              ...investments[where.id],
              ...data,
              redeemedAt: new Date(),
            }),
          },
        },
      },
    });
    mock.module("@/services/tron/client", {
      namedExports: {
        getTxId: (tx: Record<string, string> | null) => tx?.txID ?? null,
        getTransactionStatus: async (txId: string) =>
          txId === "tx-pending" ? "pending" : "success",
      },
    });
    mock.module("@/services/revenueEngine/onRedeemCompleted", {
      namedExports: { onRedeemCompleted: async () => {} },
    });
    mock.module("@/services/revenueEngine/payoutLock", {
      namedExports: { releasePayoutLock: async () => {} },
    });

    const { confirmInvestmentRedemption } = await import("./redemptions");

    const confirmed = await confirmInvestmentRedemption("inv-1");
    assert.equal(confirmed.outcome, "confirmed");

    const pending = await confirmInvestmentRedemption("inv-2");
    assert.equal(pending.outcome, "pending");
  });
});
