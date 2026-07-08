import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  type Investment,
} from "@prisma/client";
import { enrichInvestment } from "./investment";
import { userRedeemedPayoutDetail } from "@/lib/investments/userMaturityCopy";

const baseInvestment: Investment = {
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
  payoutUnlockedAt: new Date("2024-04-02T00:00:00.000Z"),
  autoPayoutAt: null,
  payoutUnlockingInvestmentIds: [],
  payoutUnlockingUserIds: [],
  payoutReason: null,
  payoutTriggeredBy: null,
  payoutFailureReason: null,
  globalQueueRank: 1,
  newSubscribersNeeded: 0,
  chainMemo: null,
  recoveryEligibleAt: null,
  sympathyNotifiedAt: null,
  maturityNotifiedAt: null,
  choiceReminderNotifiedAt: null,
  referralRecoveryCompletedAt: null,
  unpaidMaturityResolution: null,
  unpaidMaturityResolvedAt: null,
  unpaidMaturityChoiceDeadlineAt: null,
  termExtensionDays: null,
  forfeitedAt: null,
  forfeitureReason: null,
  excludedFromTriadUnlock: false,
  date: new Date("2024-01-01T00:00:00.000Z"),
};

describe("enrichInvestment", () => {
  it("maps id to _id and includes presentation fields", () => {
    const json = enrichInvestment(baseInvestment);
    assert.equal(json._id, baseInvestment.id);
    assert.equal(json.fundName, "Hustle Collective");
    assert.equal(json.statusLabel, "Payout processing");
    assert.equal(json.situation, "awaiting_admin_payout");
    assert.ok(json.statusDetail);
    assert.equal(json.canClaim, false);
    assert.equal(json.payabilityStatus, "payable");
    assert.ok(json.payoutEligibleAt);
    assert.equal(json.newSubscribersNeeded, 0);
    assert.ok(json.fund?.accentColor);
  });

  it("maps redeemed investments to marketing payout detail", () => {
    const payoutReason =
      "Unlocked after 2 later investments (25 USDT + 25 USDT). Head invested 25 USDT; required 50 USDT from newer investors (2× cohort). Received 50 USDT (2× equivalent).";
    const json = enrichInvestment({
      ...baseInvestment,
      status: InvestmentStatus.redeemed,
      redeemedAt: new Date("2024-04-05T00:00:00.000Z"),
      payoutReason,
    });
    assert.equal(json.situation, "redeemed");
    assert.equal(
      json.statusDetail,
      userRedeemedPayoutDetail("Hustle Collective")
    );
    assert.doesNotMatch(json.statusDetail, /Unlocked after/i);
  });
});
