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
    ...overrides,
  };
}

describe("buildInvestmentReasonNote", () => {
  it("shows unlock investment ids, not stored payoutReason users", () => {
    const note = buildInvestmentReasonNote(
      baseRow({
        id: "inv-head",
        payoutUnlockedAt: new Date(),
        payoutUnlockingInvestmentIds: ["inv-bbbbbbbbbbbb", "inv-cccccccccccc"],
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
        surplusPayoutReason: "insufficient_surplus",
        surplusShortfallUsdt: 28,
      })
    );
    assert.equal(note, null);
  });
});
