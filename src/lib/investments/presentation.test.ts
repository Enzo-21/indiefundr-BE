import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  type Investment,
} from "@prisma/client";
import { canUserClaim, getUserStatusLabel } from "./presentation";

const maturedUnlocked: Investment = {
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
  payoutUnlockedAt: new Date(),
  globalQueueRank: null,
  newSubscribersNeeded: null,
  date: new Date(),
} as Investment;

describe("presentation", () => {
  it("admin-only payouts: triad-unlocked matured investments are not user-claimable", () => {
    assert.equal(canUserClaim(maturedUnlocked), false);
    assert.equal(getUserStatusLabel(maturedUnlocked), "Awaiting admin payout");
  });

  it("payable without triad unlock shows queue or waiting state", () => {
    const maturedPayableOnly = {
      ...maturedUnlocked,
      payoutUnlockedAt: null,
      globalQueueRank: 1,
    } as Investment;
    assert.equal(getUserStatusLabel(maturedPayableOnly), "Payout queue #1");
  });

  it("canUserClaim false when active", () => {
    assert.equal(
      canUserClaim({ ...maturedUnlocked, status: InvestmentStatus.active }),
      false
    );
  });
});
