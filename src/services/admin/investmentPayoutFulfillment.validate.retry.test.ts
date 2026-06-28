import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
} from "@prisma/client";

const INVESTMENT_ID = "507f1f77bcf86cd799439017";

describe("validateNormalPayoutEligibility retry", () => {
  it("allows redeeming investments with payoutFailureReason", async () => {
    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          investment: {
            findUnique: async () => ({
              id: INVESTMENT_ID,
              userId: "user-1",
              fundId: "fund-1",
              status: InvestmentStatus.redeeming,
              payoutFailureReason:
                "Treasury USDT balance too low for transfer",
              payoutUnlockedAt: new Date(),
              payoutTriggeredBy: "admin",
              payabilityStatus: InvestmentPayabilityStatus.not_matured,
            }),
          },
        },
      },
    });

    const { validateNormalPayoutEligibility } = await import(
      "./investmentPayoutFulfillment"
    );
    const result = await validateNormalPayoutEligibility(INVESTMENT_ID);
    assert.equal(result.investment.status, InvestmentStatus.redeeming);
  });
});
