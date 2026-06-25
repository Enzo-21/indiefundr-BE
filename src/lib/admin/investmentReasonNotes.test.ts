import assert from "node:assert/strict";
import { InvestmentStatus } from "@prisma/client";
import { describe, it } from "node:test";
import type { AdminInvestmentRow } from "@/services/admin/investmentAdminTypes";
import { buildInvestmentReasonNote } from "./investmentReasonNotes";

function baseRow(
  overrides: Partial<AdminInvestmentRow> & { id: string }
): AdminInvestmentRow {
  return {
    id: overrides.id,
    subscribedAtIso: null,
    returnPercent90d: 15,
    ledgerAfterSubscribe: null,
    ledgerAfterPayout: null,
    ledgerEventKind: "subscription",
    payoutUnlockingInvestmentIds: [],
    payoutUnlockPrincipalRequiredUsdt: null,
    payoutUnlockPrincipalReceivedUsdt: null,
    payoutUnlockerDetails: [],
    userId: "u1",
    userEmail: "a@test.com",
    userName: null,
    fundId: "fund",
    fundName: "Fund",
    amountUsdt: 25,
    projectedPayoutUsdt: 35,
    status: InvestmentStatus.active,
    payabilityStatus: "pending_liquidity",
    subscribedAt: null,
    maturesAt: null,
    payoutEligibleAt: null,
    payoutUnlockedAt: null,
    payoutReason: "Two later investments (User B and User C) unlocked this payout.",
    payoutTriggeredBy: null,
    payoutFailureReason: null,
    payoutStatus: "waiting",
    surplusPayoutAvailableAt: null,
    surplusShortfallUsdt: 10,
    surplusPayoutReason: "insufficient_surplus",
    canPayWithSurplus: false,
    payoutUnlockers: [],
    redeemedAt: null,
    termDaysLeft: null,
    payoutEligibleInDays: null,
    canClaim: false,
    canPayNow: false,
    showPayoutActions: false,
    payNowBlockReason: null,
    surplusBlockReason: "Insufficient surplus",
    canConfirmRedemption: false,
    confirmRedemptionBlockReason: null,
    redemptionTxId: null,
    maturitySituation: "awaiting_admin_payout",
    userPathLabel: "None",
    statusDetail: "",
    chosenPath: null,
    unpaidMaturityResolution: null,
    unpaidMaturityChoiceDeadlineAt: null,
    termExtensionDays: null,
    recoveryQualifiedCount: null,
    recoveryRequiredCount: null,
    nextDeadlineAt: null,
    nextDeadlineLabel: null,
    globalQueueRank: 1,
    newSubscribersNeeded: 0,
    ...overrides,
  };
}

describe("buildInvestmentReasonNote", () => {
  it("prefers stored payoutReason when unlocked", () => {
    const detailedReason =
      "Unlocked after 2 later investments (25 USDT + 25 USDT). Head invested 25 USDT; required 50 USDT from newer investors (2× cohort). Received 50 USDT (2× equivalent).";
    const note = buildInvestmentReasonNote(
      baseRow({
        id: "inv-head",
        payoutUnlockedAt: new Date(),
        payoutUnlockingInvestmentIds: ["inv-bbbbbbbbbbbb", "inv-cccccccccccc"],
        payoutReason: detailedReason,
        payoutStatus: "ready",
        surplusPayoutReason: "normal_payout_unlocked",
        surplusShortfallUsdt: 5,
      })
    );
    assert.equal(note, detailedReason);
  });

  it("shows unlock investment ids when unlocked without payoutReason", () => {
    const note = buildInvestmentReasonNote(
      baseRow({
        id: "inv-head",
        payoutUnlockedAt: new Date(),
        payoutUnlockingInvestmentIds: ["inv-bbbbbbbbbbbb", "inv-cccccccccccc"],
        payoutReason: null,
        payoutStatus: "ready",
        surplusPayoutReason: "normal_payout_unlocked",
        surplusShortfallUsdt: 5,
      })
    );
    assert.equal(note, "Unlocked after bbbbbb and cccccc");
  });

  it("returns Paid with surplus when redeemed via surplus trigger", () => {
    const note = buildInvestmentReasonNote(
      baseRow({
        id: "inv-1",
        status: InvestmentStatus.redeemed,
        payoutStatus: "paid_surplus",
        payoutTriggeredBy: "admin_surplus_liquidity",
      })
    );
    assert.equal(note, "Paid with surplus");
  });

  it("returns empty for unpaid investment without unlock", () => {
    const note = buildInvestmentReasonNote(
      baseRow({
        id: "inv-1",
        maturitySituation: "waiting_unlock",
        statusDetail:
          "Your term ended. Two newer investments are needed to unlock your payout through the normal queue.",
        surplusPayoutReason: "insufficient_surplus",
        surplusShortfallUsdt: 28,
      })
    );
    assert.match(note ?? "", /Two newer investments/);
  });

  it("shows choice open with deadline", () => {
    const note = buildInvestmentReasonNote(
      baseRow({
        id: "inv-choice",
        maturitySituation: "choice_required",
        unpaidMaturityChoiceDeadlineAt: new Date("2099-06-05T12:00:00.000Z"),
      })
    );
    assert.match(note ?? "", /48h choice open/);
  });
});
