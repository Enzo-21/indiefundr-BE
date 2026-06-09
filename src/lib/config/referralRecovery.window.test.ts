import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRecoveryWindowActive,
  recoveryExpiresAt,
  REFERRAL_RECOVERY_WINDOW_DAYS,
} from "./referralRecovery";

describe("referral recovery window helpers", () => {
  it("recoveryExpiresAt adds configured window days", () => {
    const start = new Date("2026-01-01T12:00:00.000Z");
    const expires = recoveryExpiresAt(start);
    const days = REFERRAL_RECOVERY_WINDOW_DAYS();
    const expected = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    assert.equal(expires.toISOString(), expected.toISOString());
  });

  it("isRecoveryWindowActive is true before expiry", () => {
    const eligibleAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-05T00:00:00.000Z");
    assert.equal(isRecoveryWindowActive(eligibleAt, now), true);
  });

  it("isRecoveryWindowActive is false on or after expiry", () => {
    const eligibleAt = new Date("2026-01-01T00:00:00.000Z");
    const days = REFERRAL_RECOVERY_WINDOW_DAYS();
    const onExpiry = new Date(
      eligibleAt.getTime() + days * 24 * 60 * 60 * 1000
    );
    assert.equal(isRecoveryWindowActive(eligibleAt, onExpiry), false);
    assert.equal(
      isRecoveryWindowActive(eligibleAt, new Date(onExpiry.getTime() + 1)),
      false
    );
  });

  it("isRecoveryWindowActive is false without eligibleAt", () => {
    assert.equal(isRecoveryWindowActive(null), false);
  });
});
