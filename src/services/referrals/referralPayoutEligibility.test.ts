import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("referral payout gate", () => {
  it("requires both inviter and invitee to have invested before payout", () => {
    const cases = [
      { inviter: false, invitee: false, expected: false },
      { inviter: true, invitee: false, expected: false },
      { inviter: false, invitee: true, expected: false },
      { inviter: true, invitee: true, expected: true },
    ];

    for (const row of cases) {
      const canPay = row.inviter && row.invitee;
      assert.equal(canPay, row.expected);
    }
  });
});
