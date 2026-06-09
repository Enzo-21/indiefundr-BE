import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldUseRecoverySlot } from "./referralRewardEngine";

describe("shouldUseRecoverySlot", () => {
  it("uses recovery slot when link is empty", () => {
    assert.equal(shouldUseRecoverySlot(null, "invite-1", 2), true);
    assert.equal(
      shouldUseRecoverySlot({ completedAt: null, inviteIds: [] }, "invite-1", 2),
      true
    );
  });

  it("uses recovery slot for second invite when first is counted", () => {
    assert.equal(
      shouldUseRecoverySlot(
        { completedAt: null, inviteIds: ["invite-1"] },
        "invite-2",
        2
      ),
      true
    );
  });

  it("does not use recovery slot when slots are full", () => {
    assert.equal(
      shouldUseRecoverySlot(
        { completedAt: null, inviteIds: ["invite-1", "invite-2"] },
        "invite-3",
        2
      ),
      false
    );
  });

  it("does not use recovery slot when recovery is complete", () => {
    assert.equal(
      shouldUseRecoverySlot(
        {
          completedAt: new Date(),
          inviteIds: ["invite-1", "invite-2"],
        },
        "invite-3",
        2
      ),
      false
    );
  });

  it("does not reuse recovery slot for the same invite", () => {
    assert.equal(
      shouldUseRecoverySlot(
        { completedAt: null, inviteIds: ["invite-1"] },
        "invite-1",
        2
      ),
      false
    );
  });
});
