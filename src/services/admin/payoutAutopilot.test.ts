import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvestmentStatus } from "@prisma/client";
import type { AdminInvestmentRow } from "@/services/admin/investmentAdminTypes";
import { buildAutopilotPayoutCandidatesFromRows } from "./payoutAutopilot";

const adminMaturityDefaults = {
  payoutUnlockPrincipalRequiredUsdt: null,
  payoutUnlockPrincipalReceivedUsdt: null,
  payoutUnlockerDetails: [] as AdminInvestmentRow["payoutUnlockerDetails"],
  maturitySituation: "active",
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
  globalQueueRank: null,
  newSubscribersNeeded: null,
} as const;

const mockRows: AdminInvestmentRow[] = [
  {
    id: "inv-normal-1",
    subscribedAtIso: "2026-01-01T00:00:00.000Z",
    returnPercent90d: 40,
    ledgerAfterSubscribe: null,
    ledgerAfterPayout: null,
    ledgerEventKind: "subscription",
    payoutUnlockingInvestmentIds: [],
    userId: "user-1",
    userEmail: "normal1@example.com",
    userName: "Normal One",
    fundId: "growth",
    fundName: "Growth",
    amountUsdt: 25,
    projectedPayoutUsdt: 35,
    status: InvestmentStatus.matured,
    payabilityStatus: "payable",
    subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
    maturesAt: null,
    payoutEligibleAt: null,
    payoutUnlockedAt: new Date("2026-01-03T00:00:00.000Z"),
    payoutReason: null,
    payoutTriggeredBy: null,
    payoutFailureReason: null,
    payoutStatus: "ready",
    surplusPayoutAvailableAt: null,
    surplusShortfallUsdt: 0,
    surplusPayoutReason: "normal_payout_unlocked",
    canPayWithSurplus: false,
    payoutUnlockers: [],
    redeemedAt: null,
    termDaysLeft: null,
    payoutEligibleInDays: null,
    canClaim: false,
    canPayNow: true,
    showPayoutActions: true,
    payNowBlockReason: null,
    surplusBlockReason: null,
    canConfirmRedemption: false,
    confirmRedemptionBlockReason: null,
    redemptionTxId: null,
    ...adminMaturityDefaults,
  },
  {
    id: "inv-normal-2",
    subscribedAtIso: "2026-01-02T00:00:00.000Z",
    returnPercent90d: 40,
    ledgerAfterSubscribe: null,
    ledgerAfterPayout: null,
    ledgerEventKind: "subscription",
    payoutUnlockingInvestmentIds: [],
    userId: "user-2",
    userEmail: "normal2@example.com",
    userName: "Normal Two",
    fundId: "growth",
    fundName: "Growth",
    amountUsdt: 25,
    projectedPayoutUsdt: 35,
    status: InvestmentStatus.matured,
    payabilityStatus: "payable",
    subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
    maturesAt: null,
    payoutEligibleAt: null,
    payoutUnlockedAt: new Date("2026-01-04T00:00:00.000Z"),
    payoutReason: null,
    payoutTriggeredBy: null,
    payoutFailureReason: null,
    payoutStatus: "ready",
    surplusPayoutAvailableAt: null,
    surplusShortfallUsdt: 0,
    surplusPayoutReason: "normal_payout_unlocked",
    canPayWithSurplus: false,
    payoutUnlockers: [],
    redeemedAt: null,
    termDaysLeft: null,
    payoutEligibleInDays: null,
    canClaim: false,
    canPayNow: true,
    showPayoutActions: true,
    payNowBlockReason: null,
    surplusBlockReason: null,
    canConfirmRedemption: false,
    confirmRedemptionBlockReason: null,
    redemptionTxId: null,
    ...adminMaturityDefaults,
  },
  {
    id: "inv-surplus-1",
    subscribedAtIso: "2026-01-03T00:00:00.000Z",
    returnPercent90d: 40,
    ledgerAfterSubscribe: null,
    ledgerAfterPayout: null,
    ledgerEventKind: "subscription",
    payoutUnlockingInvestmentIds: [],
    userId: "user-3",
    userEmail: "surplus1@example.com",
    userName: "Surplus One",
    fundId: "growth",
    fundName: "Growth",
    amountUsdt: 25,
    projectedPayoutUsdt: 35,
    status: InvestmentStatus.active,
    payabilityStatus: "pending_liquidity",
    subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
    maturesAt: null,
    payoutEligibleAt: null,
    payoutUnlockedAt: null,
    payoutReason: null,
    payoutTriggeredBy: null,
    payoutFailureReason: null,
    payoutStatus: "surplus_ready",
    surplusPayoutAvailableAt: new Date("2026-01-05T00:00:00.000Z"),
    surplusShortfallUsdt: 0,
    surplusPayoutReason: "liquidity_fifo_eligible",
    canPayWithSurplus: true,
    payoutUnlockers: [],
    redeemedAt: null,
    termDaysLeft: null,
    payoutEligibleInDays: null,
    canClaim: false,
    canPayNow: false,
    showPayoutActions: true,
    payNowBlockReason: "Waiting for two-user unlock",
    surplusBlockReason: null,
    canConfirmRedemption: false,
    confirmRedemptionBlockReason: null,
    redemptionTxId: null,
    ...adminMaturityDefaults,
  },
];

describe("buildAutopilotPayoutCandidatesFromRows", () => {
  it("returns normal-only candidates when includeSurplus is false", () => {
    const candidates = buildAutopilotPayoutCandidatesFromRows(mockRows, {
      includeNormal: true,
      includeSurplus: false,
    });

    assert.equal(candidates.length, 2);
    assert.ok(candidates.every((row) => row.mode === "normal"));
    assert.deepEqual(
      candidates.map((row) => row.investmentId),
      ["inv-normal-1", "inv-normal-2"]
    );
  });

  it("returns surplus-only candidates when includeNormal is false", () => {
    const candidates = buildAutopilotPayoutCandidatesFromRows(mockRows, {
      includeNormal: false,
      includeSurplus: true,
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.mode, "surplus");
    assert.equal(candidates[0]?.investmentId, "inv-surplus-1");
  });

  it("orders normal candidates before surplus and avoids duplicate ids", () => {
    const candidates = buildAutopilotPayoutCandidatesFromRows(mockRows, {
      includeNormal: true,
      includeSurplus: true,
    });

    assert.deepEqual(
      candidates.map((row) => row.investmentId),
      ["inv-normal-1", "inv-normal-2", "inv-surplus-1"]
    );
    assert.deepEqual(
      candidates.map((row) => row.mode),
      ["normal", "normal", "surplus"]
    );
    assert.equal(new Set(candidates.map((row) => row.investmentId)).size, 3);
  });
});
