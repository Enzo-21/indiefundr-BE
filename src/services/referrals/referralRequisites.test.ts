import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInviteeRequisitesForTest,
  buildInviterRequisitesForTest,
} from "./referralRequisites";

describe("referralRequisites", () => {
  it("builds invitee requisites from investment flags", () => {
    const pending = buildInviteeRequisitesForTest(false, false);
    assert.equal(pending[0]?.status, "pending");
    assert.equal(pending[1]?.status, "pending");
    assert.match(pending[0]?.label ?? "", /You have invested/);
    assert.match(pending[1]?.label ?? "", /inviter has invested/);

    const partial = buildInviteeRequisitesForTest(true, false);
    assert.equal(partial[0]?.status, "complete");
    assert.equal(partial[1]?.status, "pending");

    const complete = buildInviteeRequisitesForTest(true, true);
    assert.equal(complete[0]?.status, "complete");
    assert.equal(complete[1]?.status, "complete");
  });

  it("builds inviter requisites from investment flags", () => {
    const pending = buildInviterRequisitesForTest(false, false);
    assert.match(pending[0]?.label ?? "", /You have invested/);
    assert.match(pending[1]?.label ?? "", /invited friend has invested/);

    const partial = buildInviterRequisitesForTest(true, false);
    assert.equal(partial[0]?.status, "complete");
    assert.equal(partial[1]?.status, "pending");
  });
});
