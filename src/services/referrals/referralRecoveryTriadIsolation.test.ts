import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentStatus,
  UnpaidMaturityResolution,
} from "@prisma/client";
import { REFERRAL_RECOVERY_PRINCIPAL_USDT } from "@/lib/config/referralRecovery";
import { isExcludedFromNormalPayout } from "@/lib/investments/referralRecoveryNormalPayout";
import {
  computeFifoSurplusEligibleInvestmentIds,
  findUnlockingInvestments,
  getSurplusPayoutEligibility,
} from "@/services/revenueEngine/payoutScheduler";
import { buildGlobalQueue } from "@/services/revenueEngine/queue";
import { shouldUseRecoverySlot } from "./referralRewardEngine";

describe("referral recovery triad isolation", () => {
  it("recovery slots enqueue principal recovery amount only (25 USDT)", () => {
    assert.equal(REFERRAL_RECOVERY_PRINCIPAL_USDT(), 25);
  });

  it("recovery invitees do not unlock triad for another user's matured investment", () => {
    const otherUsersMaturedHead = {
      id: "user-b-head",
      userId: "user-b",
      amountUsdt: 25,
      subscribedAt: new Date("2026-02-01T00:00:00.000Z"),
    };

    const recoveryInviteeInvestments = [
      {
        id: "invitee-1-inv",
        userId: "invitee-1",
        amountUsdt: 25,
        subscribedAt: new Date("2026-02-02T00:00:00.000Z"),
        excludedFromTriadUnlock: true,
      },
      {
        id: "invitee-2-inv",
        userId: "invitee-2",
        amountUsdt: 25,
        subscribedAt: new Date("2026-02-03T00:00:00.000Z"),
        excludedFromTriadUnlock: true,
      },
    ];

    const unlockers = findUnlockingInvestments(
      otherUsersMaturedHead,
      recoveryInviteeInvestments
    );

    assert.equal(unlockers.length, 0);
  });

  it("third invite during recovery window uses standard slot, not recovery", () => {
    const link = {
      completedAt: null,
      inviteIds: ["invite-1", "invite-2"],
    };
    assert.equal(shouldUseRecoverySlot(link, "invite-3", 2), false);
  });

  it("referral recovery investments are excluded from normal payout paths", () => {
    const recoveryHead = {
      id: "recovery-head",
      userId: "user-recovery",
      fundId: "aggressive-alpha",
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
      status: InvestmentStatus.matured,
      projectedPayoutUsdt: 35,
      unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery,
      referralRecoveryCompletedAt: null,
      payoutUnlockedAt: null,
      redemptionTransaction: null,
      maturesAt: new Date("2026-04-01T00:00:00.000Z"),
    };

    assert.equal(isExcludedFromNormalPayout(recoveryHead), true);

    const eligibility = getSurplusPayoutEligibility(recoveryHead, {
      treasurySurplus: 1000,
    });
    assert.equal(eligibility.reason, "referral_recovery_path");
    assert.equal(eligibility.eligibleForLiquiditySurplusPay, false);

    const fifoEligible = computeFifoSurplusEligibleInvestmentIds(
      [recoveryHead],
      { treasurySurplus: 1000 }
    );
    assert.equal(fifoEligible.has(recoveryHead.id), false);

    const queue = buildGlobalQueue([recoveryHead] as Parameters<
      typeof buildGlobalQueue
    >[0]);
    assert.equal(queue.length, 0);
  });
});
