import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentStatus,
  PurchaseOrderStatus,
  PurchaseOrderStep,
} from "@prisma/client";
import { defaultTypicalPayoutDays } from "@/services/funds/typicalPayoutDays";
import {
  insightsFromInvestment,
  insightsFromPurchaseOrder,
  insightsFromRedemption,
} from "./transactionInsights";
import { isUnpaidMaturityChoicePending } from "@/services/investments/unpaidMaturityChoice";

describe("transactionInsights", () => {
  it("builds projected payout for purchase order without linked investment", () => {
    const insights = insightsFromPurchaseOrder(
      {
        id: "ord-1",
        fundId: "growth-partners",
        costUsdt: 25,
        date: new Date("2026-01-01T00:00:00.000Z"),
        investmentId: null,
      },
      {
        id: "growth-partners",
        name: "Arbitrage Circuit",
        tagline: "",
        returnPercent90d: 25,
        termDays: 90,
        riskLevel: "medium_high",
        riskLabel: "Medium-high risk",
        destinations: [],
        accentColor: "#000",
        icon: "bolt",
      }
    );

    assert.equal(insights.kind, "purchase_order");
    assert.equal(insights.principalUsdt, 25);
    assert.equal(insights.projectedPayoutUsdt, 31.25);
    assert.equal(insights.expectedEarningsUsdt, 6.25);
    assert.equal(insights.targetReturnPercent, 25);
    assert.equal(insights.typicalPayoutDays, defaultTypicalPayoutDays(90));
  });

  it("computes payout days elapsed for redemption", () => {
    const subscribedAt = new Date("2026-01-01T00:00:00.000Z");
    const redeemedAt = new Date("2026-01-06T12:00:00.000Z");
    const insights = insightsFromRedemption(
      {
        id: "inv-1",
        userId: "u1",
        walletId: "w1",
        fundId: "growth-partners",
        amountUsdt: 25,
        returnPercent90d: 25,
        projectedPayoutUsdt: 31.25,
        status: InvestmentStatus.redeemed,
        purchaseOrderId: null,
        transaction: null,
        redemptionTransaction: null,
        subscribedAt,
        maturesAt: new Date("2026-03-01T00:00:00.000Z"),
        redeemedAt,
        payabilityStatus: "not_matured",
        payoutEligibleAt: null,
        markedPayableAt: null,
        payoutUnlockedAt: null,
        autoPayoutAt: null,
        payoutUnlockingInvestmentIds: [],
        payoutUnlockingUserIds: [],
        payoutReason: null,
        payoutTriggeredBy: null,
        payoutFailureReason: null,
        globalQueueRank: null,
        newSubscribersNeeded: null,
        chainMemo: null,
        recoveryEligibleAt: null,
        sympathyNotifiedAt: null,
        referralRecoveryCompletedAt: null,
        unpaidMaturityResolution: null,
        unpaidMaturityResolvedAt: null,
        termExtensionDays: null,
        date: subscribedAt,
      },
      {
        id: "growth-partners",
        name: "Arbitrage Circuit",
        tagline: "",
        returnPercent90d: 25,
        termDays: 90,
        riskLevel: "medium_high",
        riskLabel: "Medium-high risk",
        destinations: [],
        accentColor: "#000",
        icon: "bolt",
      },
      31.25,
      7
    );

    assert.equal(insights.kind, "redemption");
    assert.equal(insights.creditedUsdt, 31.25);
    assert.equal(insights.payoutDaysElapsed, 5);
    assert.equal(insights.typicalPayoutDays, 7);
    assert.equal(insights.investmentId, "inv-1");
    assert.equal(insights.purchaseOrderId, null);
  });

  it("includes purchase order id on redemption when investment was subscribed via order", () => {
    const insights = insightsFromRedemption({
      id: "inv-2",
      userId: "u1",
      walletId: "w1",
      fundId: "aggressive-alpha",
      amountUsdt: 25,
      returnPercent90d: 40,
      projectedPayoutUsdt: 35,
      status: InvestmentStatus.redeemed,
      purchaseOrderId: "ord-abc",
      transaction: null,
      redemptionTransaction: null,
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
      maturesAt: new Date("2026-03-01T00:00:00.000Z"),
      redeemedAt: new Date("2026-01-04T00:00:00.000Z"),
      payabilityStatus: "not_matured",
      payoutEligibleAt: null,
      markedPayableAt: null,
      payoutUnlockedAt: null,
      autoPayoutAt: null,
      payoutUnlockingInvestmentIds: [],
      payoutUnlockingUserIds: [],
      payoutReason: null,
      payoutTriggeredBy: null,
      payoutFailureReason: null,
      globalQueueRank: null,
      newSubscribersNeeded: null,
      chainMemo: null,
      recoveryEligibleAt: null,
      sympathyNotifiedAt: null,
      referralRecoveryCompletedAt: null,
      unpaidMaturityResolution: null,
      unpaidMaturityResolvedAt: null,
      termExtensionDays: null,
      date: new Date("2026-01-01T00:00:00.000Z"),
    });

    assert.equal(insights.purchaseOrderId, "ord-abc");
    assert.equal(insights.investmentId, "inv-2");
  });

  it("includes lifecycle status on matured investment insights", () => {
    const now = new Date();
    const deadline = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const investment = {
      id: "inv-matured",
      userId: "u1",
      walletId: "w1",
      fundId: "growth-partners",
      amountUsdt: 25,
      returnPercent90d: 25,
      projectedPayoutUsdt: 31.25,
      status: InvestmentStatus.matured,
      purchaseOrderId: "ord-1",
      transaction: null,
      redemptionTransaction: null,
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
      maturesAt: new Date("2026-06-01T00:00:00.000Z"),
      redeemedAt: null,
      payabilityStatus: "pending_liquidity" as const,
      payoutEligibleAt: null,
      markedPayableAt: null,
      payoutUnlockedAt: null,
      autoPayoutAt: null,
      payoutUnlockingInvestmentIds: [],
      payoutUnlockingUserIds: [],
      payoutReason: null,
      payoutTriggeredBy: null,
      payoutFailureReason: null,
      globalQueueRank: null,
      newSubscribersNeeded: null,
      chainMemo: null,
      recoveryEligibleAt: null,
      sympathyNotifiedAt: null,
      maturityNotifiedAt: null,
      referralRecoveryCompletedAt: null,
      unpaidMaturityResolution: null,
      unpaidMaturityResolvedAt: null,
      unpaidMaturityChoiceDeadlineAt: deadline,
      termExtensionDays: null,
      forfeitedAt: null,
      forfeitureReason: null,
      excludedFromTriadUnlock: false,
      date: new Date("2026-01-01T00:00:00.000Z"),
    };

    assert.equal(
      isUnpaidMaturityChoicePending(
        investment as Parameters<typeof isUnpaidMaturityChoicePending>[0],
        new Set(),
        now
      ),
      true
    );

    const insights = insightsFromInvestment(investment, undefined, undefined, {
      fifoEligibleIds: new Set(),
    });
    assert.equal(insights.investmentStatus, "matured");
    assert.equal(insights.statusLabel, "Choose next step");
    assert.equal(insights.needsUnpaidMaturityChoice, true);
  });

  it("omits internal unlock detail from user-facing investment insights", () => {
    const payoutReason =
      "Unlocked after 2 later investments (25 USDT + 25 USDT). Head invested 25 USDT; required 50 USDT from newer investors (2× cohort). Received 50 USDT (2× equivalent).";
    const investment = {
      id: "inv-unlocked",
      userId: "u1",
      walletId: "w1",
      fundId: "growth-partners",
      amountUsdt: 25,
      returnPercent90d: 25,
      projectedPayoutUsdt: 31.25,
      status: InvestmentStatus.matured,
      purchaseOrderId: "ord-1",
      transaction: null,
      redemptionTransaction: null,
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
      maturesAt: new Date("2026-06-01T00:00:00.000Z"),
      redeemedAt: null,
      payabilityStatus: "payable" as const,
      payoutEligibleAt: null,
      markedPayableAt: null,
      payoutUnlockedAt: new Date("2026-06-02T00:00:00.000Z"),
      autoPayoutAt: null,
      payoutUnlockingInvestmentIds: ["inv-2", "inv-3"],
      payoutUnlockingUserIds: [],
      payoutReason,
      payoutTriggeredBy: null,
      payoutFailureReason: null,
      globalQueueRank: null,
      newSubscribersNeeded: null,
      chainMemo: null,
      recoveryEligibleAt: null,
      sympathyNotifiedAt: null,
      referralRecoveryCompletedAt: null,
      unpaidMaturityResolution: null,
      unpaidMaturityResolvedAt: null,
      termExtensionDays: null,
      date: new Date("2026-01-01T00:00:00.000Z"),
    };

    const insights = insightsFromInvestment(investment);
    assert.equal(insights.unlockDetail, null);
    assert.match(
      insights.statusDetail ?? "",
      /Our team will process the transfer/
    );
    assert.doesNotMatch(insights.statusDetail ?? "", /2×/);
  });

  it("omits unlock detail from redemption insights", () => {
    const insights = insightsFromRedemption({
      id: "inv-1",
      userId: "u1",
      walletId: "w1",
      fundId: "growth-partners",
      amountUsdt: 25,
      returnPercent90d: 25,
      projectedPayoutUsdt: 31.25,
      status: InvestmentStatus.redeemed,
      purchaseOrderId: null,
      transaction: null,
      redemptionTransaction: null,
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
      maturesAt: new Date("2026-03-01T00:00:00.000Z"),
      redeemedAt: new Date("2026-01-06T12:00:00.000Z"),
      payabilityStatus: "not_matured",
      payoutEligibleAt: null,
      markedPayableAt: null,
      payoutUnlockedAt: new Date("2026-01-05T00:00:00.000Z"),
      autoPayoutAt: null,
      payoutUnlockingInvestmentIds: ["inv-2", "inv-3"],
      payoutUnlockingUserIds: [],
      payoutReason: null,
      payoutTriggeredBy: null,
      payoutFailureReason: null,
      globalQueueRank: null,
      newSubscribersNeeded: null,
      chainMemo: null,
      recoveryEligibleAt: null,
      sympathyNotifiedAt: null,
      referralRecoveryCompletedAt: null,
      unpaidMaturityResolution: null,
      unpaidMaturityResolvedAt: null,
      termExtensionDays: null,
      date: new Date("2026-01-01T00:00:00.000Z"),
    });

    assert.equal(insights.unlockDetail, null);
    assert.equal(insights.statusDetail, "Payout completed.");
  });
});
