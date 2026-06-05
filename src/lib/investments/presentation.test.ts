import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  type Investment,
} from "@prisma/client";
import { canUserClaim, getUserStatusLabel } from "./presentation";

const maturedPayable: Investment = {
  id: "1",
  userId: "2",
  walletId: "3",
  fundId: "balanced-growth",
  amountUsdt: 25,
  returnPercent90d: 25,
  projectedPayoutUsdt: 31.25,
  status: InvestmentStatus.matured,
  purchaseOrderId: null,
  transaction: null,
  redemptionTransaction: null,
  subscribedAt: new Date(),
  maturesAt: new Date(),
  redeemedAt: null,
  payabilityStatus: InvestmentPayabilityStatus.payable,
  payoutEligibleAt: new Date("2020-01-01"),
  markedPayableAt: null,
  globalQueueRank: null,
  newSubscribersNeeded: null,
  date: new Date(),
};

describe("presentation", () => {
  it("admin-only payouts: matured payable investments are not user-claimable", () => {
    assert.equal(canUserClaim(maturedPayable), false);
    assert.equal(getUserStatusLabel(maturedPayable), "Awaiting admin payout");
  });

  it("canUserClaim false when active", () => {
    assert.equal(
      canUserClaim({ ...maturedPayable, status: InvestmentStatus.active }),
      false
    );
  });
});
