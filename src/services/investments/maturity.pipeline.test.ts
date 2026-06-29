import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { InvestmentStatus } from "@prisma/client";

describe("markMaturedInvestments notification pipeline order", () => {
  it("runs onInvestmentMatured before notifyNewlyMaturedInvestments", async () => {
    const callOrder: string[] = [];
    let matured = false;

    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          investment: {
            findMany: async () => {
              if (matured) return [];
              return [
                {
                  id: "inv-1",
                  userId: "user-1",
                  fundId: "growth-partners",
                  payoutUnlockedAt: null,
                  unpaidMaturityResolution: null,
                },
              ];
            },
            count: async () => 0,
            update: async () => {
              matured = true;
              return {};
            },
          },
        },
      },
    });
    mock.module("@/services/investments/investmentForfeiture", {
      namedExports: {
        forfeitInvestment: async () => ({ ok: false }),
      },
    });
    mock.module("@/services/investments/postMaturityProcessing", {
      namedExports: {
        processNewlyMaturedInvestments: async () => {
          callOrder.push("processNewlyMatured");
        },
      },
    });
    mock.module("@/services/revenueEngine/onInvestmentMatured", {
      namedExports: {
        onInvestmentMatured: async () => {
          callOrder.push("onInvestmentMatured");
        },
      },
    });
    mock.module("@/services/investments/maturityNotifications", {
      namedExports: {
        notifyNewlyMaturedInvestments: async () => {
          callOrder.push("notifyNewlyMatured");
          return {
            emailsSent: 0,
            emailsFailed: 0,
            emailsSkipped: 0,
            pushSent: 0,
            pushSkippedNoDevice: 0,
            pushFailed: 0,
          };
        },
      },
    });

    const { markMaturedInvestments } = await import("./maturity");

    await markMaturedInvestments();

    assert.deepEqual(callOrder, [
      "processNewlyMatured",
      "onInvestmentMatured",
      "notifyNewlyMatured",
    ]);
  });
});
