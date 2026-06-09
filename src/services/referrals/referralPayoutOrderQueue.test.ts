import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReferralPayoutOrderKind } from "@prisma/client";
import { referralPayoutOrderKindLabel } from "./referralPayoutOrderQueue";
import { shouldUseRecoverySlot } from "./referralRewardEngine";

describe("referralPayoutOrderKindLabel", () => {
  it("labels each payout kind", () => {
    assert.equal(
      referralPayoutOrderKindLabel(ReferralPayoutOrderKind.invitee_bonus),
      "Invitee bonus"
    );
    assert.equal(
      referralPayoutOrderKindLabel(ReferralPayoutOrderKind.principal_recovery),
      "Principal recovery"
    );
  });
});

describe("recovery slot gating for referral orders", () => {
  it("blocks inviter bonus slots while recovery is in progress", () => {
    assert.equal(
      shouldUseRecoverySlot(
        { completedAt: null, inviteIds: ["invite-1", "invite-2"] },
        "invite-3",
        2
      ),
      false
    );
  });
});
