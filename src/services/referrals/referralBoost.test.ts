import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boostExpiresAt,
  getBoostInviteesRequired,
  isBoostWindowActive,
} from "@/lib/config/referralBoost";
import {
  shouldUseBoostSlot,
  shouldUseRecoverySlot,
} from "@/services/referrals/referralRewardEngine";

describe("referralBoost config", () => {
  it("requires 2 invitees per 25 USDT principal", () => {
    assert.equal(getBoostInviteesRequired(25), 2);
    assert.equal(getBoostInviteesRequired(50), 4);
    assert.equal(getBoostInviteesRequired(100), 8);
  });

  it("computes a 3-day window from activation", () => {
    const activated = new Date("2026-08-01T00:00:00.000Z");
    const expires = boostExpiresAt(activated);
    assert.equal(expires.toISOString(), "2026-08-04T00:00:00.000Z");
    assert.equal(isBoostWindowActive(activated, new Date("2026-08-03T23:00:00.000Z")), true);
    assert.equal(isBoostWindowActive(activated, new Date("2026-08-04T00:00:00.000Z")), false);
  });
});

describe("shouldUseBoostSlot", () => {
  it("accepts the first invite when no link exists", () => {
    assert.equal(shouldUseBoostSlot(null, "invite-1", 2), true);
  });

  it("rejects cancelled or completed links", () => {
    assert.equal(
      shouldUseBoostSlot(
        {
          completedAt: null,
          cancelledAt: new Date(),
          inviteIds: [],
        },
        "invite-1",
        2
      ),
      false
    );
    assert.equal(
      shouldUseBoostSlot(
        {
          completedAt: new Date(),
          cancelledAt: null,
          inviteIds: ["a", "b"],
        },
        "invite-3",
        2
      ),
      false
    );
  });

  it("rejects duplicates and full slots", () => {
    assert.equal(
      shouldUseBoostSlot(
        { completedAt: null, cancelledAt: null, inviteIds: ["invite-1"] },
        "invite-1",
        2
      ),
      false
    );
    assert.equal(
      shouldUseBoostSlot(
        {
          completedAt: null,
          cancelledAt: null,
          inviteIds: ["invite-1", "invite-2"],
        },
        "invite-3",
        2
      ),
      false
    );
  });

  it("still shares recovery slot helper behavior", () => {
    assert.equal(
      shouldUseRecoverySlot({ completedAt: null, inviteIds: [] }, "x", 2),
      true
    );
  });
});
