import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REFERRAL_RECOVERY_PRINCIPAL_USDT } from "@/lib/config/referralRecovery";
import { findUnlockingInvestments } from "@/services/revenueEngine/payoutScheduler";
import { shouldUseRecoverySlot } from "./referralRewardEngine";

describe("referral recovery triad isolation", () => {
  it("recovery slots enqueue principal recovery amount only (25 USDT)", () => {
    assert.equal(REFERRAL_RECOVERY_PRINCIPAL_USDT(), 25);
  });

  it("recovery invitees do not unlock triad for another user's matured investment", () => {
    const otherUsersMaturedHead = {
      id: "user-b-head",
      userId: "user-b",
      subscribedAt: new Date("2026-02-01T00:00:00.000Z"),
    };

    const recoveryInviteeInvestments = [
      {
        id: "invitee-1-inv",
        userId: "invitee-1",
        subscribedAt: new Date("2026-02-02T00:00:00.000Z"),
        excludedFromTriadUnlock: true,
      },
      {
        id: "invitee-2-inv",
        userId: "invitee-2",
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
});
