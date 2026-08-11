import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRecoveryInviteesRequired } from "./referralRecovery";

describe("getRecoveryInviteesRequired", () => {
  it("scales invitees with principal tier", () => {
    assert.equal(getRecoveryInviteesRequired(25), 2);
    assert.equal(getRecoveryInviteesRequired(50), 2);
    assert.equal(getRecoveryInviteesRequired(100), 4);
    assert.equal(getRecoveryInviteesRequired(150), 6);
    assert.equal(getRecoveryInviteesRequired(200), 8);
  });

  it("uses at least one base unit", () => {
    assert.equal(getRecoveryInviteesRequired(0), 2);
  });
});
