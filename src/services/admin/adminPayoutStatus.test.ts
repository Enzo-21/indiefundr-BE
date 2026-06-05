import assert from "node:assert/strict";
import { InvestmentStatus } from "@prisma/client";
import { describe, it } from "node:test";
import { deriveAdminPayoutStatus } from "./adminPayoutStatus";

describe("deriveAdminPayoutStatus", () => {
  it("redeemed + admin → paid", () => {
    assert.equal(
      deriveAdminPayoutStatus({
        status: InvestmentStatus.redeemed,
        payoutTriggeredBy: "admin",
        payoutFailureReason: null,
        payoutUnlockedAt: new Date(),
      }),
      "paid"
    );
  });

  it("redeemed + admin_surplus_liquidity → paid_surplus", () => {
    assert.equal(
      deriveAdminPayoutStatus({
        status: InvestmentStatus.redeemed,
        payoutTriggeredBy: "admin_surplus_liquidity",
        payoutFailureReason: null,
        payoutUnlockedAt: null,
      }),
      "paid_surplus"
    );
  });

  it("redeeming without failure → paying or paying_surplus", () => {
    assert.equal(
      deriveAdminPayoutStatus({
        status: InvestmentStatus.redeeming,
        payoutTriggeredBy: "admin",
        payoutFailureReason: null,
        payoutUnlockedAt: new Date(),
      }),
      "paying"
    );
    assert.equal(
      deriveAdminPayoutStatus({
        status: InvestmentStatus.redeeming,
        payoutTriggeredBy: "admin_surplus_liquidity",
        payoutFailureReason: null,
        payoutUnlockedAt: null,
      }),
      "paying_surplus"
    );
  });

  it("unlocked → ready (never scheduled)", () => {
    assert.equal(
      deriveAdminPayoutStatus({
        status: InvestmentStatus.matured,
        payoutTriggeredBy: null,
        payoutFailureReason: null,
        payoutUnlockedAt: new Date("2030-01-01"),
      }),
      "ready"
    );
  });

  it("not unlocked → waiting", () => {
    assert.equal(
      deriveAdminPayoutStatus({
        status: InvestmentStatus.active,
        payoutTriggeredBy: null,
        payoutFailureReason: null,
        payoutUnlockedAt: null,
      }),
      "waiting"
    );
  });
});
