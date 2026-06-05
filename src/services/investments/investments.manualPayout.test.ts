import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  type Investment,
} from "@prisma/client";
import { canUserClaim, getUserStatusLabel } from "@/lib/investments/presentation";
import { enrichInvestment } from "@/lib/serializers/investment";

const maturedPayable: Investment = {
  id: "507f1f77bcf86cd799439011",
  userId: "507f1f77bcf86cd799439012",
  walletId: "507f1f77bcf86cd799439013",
  fundId: "balanced-growth",
  amountUsdt: 25,
  returnPercent90d: 25,
  projectedPayoutUsdt: 31.25,
  status: InvestmentStatus.matured,
  purchaseOrderId: null,
  transaction: null,
  redemptionTransaction: null,
  subscribedAt: new Date("2024-01-01T00:00:00.000Z"),
  maturesAt: new Date("2024-04-01T00:00:00.000Z"),
  redeemedAt: null,
  payabilityStatus: InvestmentPayabilityStatus.payable,
  payoutEligibleAt: new Date("2020-01-01T00:00:00.000Z"),
  markedPayableAt: null,
  globalQueueRank: 1,
  newSubscribersNeeded: 0,
  date: new Date("2024-01-01T00:00:00.000Z"),
} as Investment;

describe("admin-only payout fulfillment (user-facing)", () => {
  it("disables canClaim and shows awaiting admin payout label", () => {
    assert.equal(canUserClaim(maturedPayable), false);
    assert.equal(getUserStatusLabel(maturedPayable), "Awaiting admin payout");
    const json = enrichInvestment(maturedPayable);
    assert.equal(json.canClaim, false);
    assert.equal(json.statusLabel, "Awaiting admin payout");
  });
});
