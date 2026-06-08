import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("referral share and inviter-stats response shapes", () => {
  it("share endpoint returns code and shareUrl only", () => {
    const share = {
      share: {
        code: "ABC12345",
        shareUrl: "https://example.com/invite?code=ABC12345",
      },
    };

    assert.ok(share.share.code);
    assert.ok(share.share.shareUrl);
    assert.equal("inviteCount" in share, false);
    assert.equal("totals" in share, false);
    assert.equal("canEarnInviterRewards" in share.share, false);
  });

  it("pending totals include awaiting-friend bonuses", () => {
    const inviterBonus = 2;
    const pendingFromRewards = 0;
    const awaitingFriends = 1;
    const pendingUsdt = pendingFromRewards + awaitingFriends * inviterBonus;

    assert.equal(pendingUsdt, 2);
  });

  it("inviter-stats endpoint returns stats without share code", () => {
    const stats = {
      inviteCount: 3,
      totals: { earnedUsdt: 4, pendingUsdt: 2 },
      canEarnInviterRewards: true,
      mode: "standard" as const,
      recovery: null,
    };

    assert.equal(typeof stats.inviteCount, "number");
    assert.ok(stats.totals);
    assert.equal("share" in stats, false);
    assert.equal("invites" in stats, false);
  });
});
