import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeEarnedLevel,
  meetsLevelRequirements,
  type PlayerLevelStats,
} from "./playerLevelProgress";

function stats(overrides: Partial<PlayerLevelStats> = {}): PlayerLevelStats {
  return {
    lifetimeInvestmentCount: 0,
    completedInvestmentCount: 0,
    redeemedCount: 0,
    distinctFundsInvested: 0,
    qualifiedReferralCount: 0,
    qualifiedInviterBonusReferralCount: 0,
    ...overrides,
  };
}

describe("playerLevelProgress", () => {
  it("level 1 requires 3 lifetime investments and 1 completed", () => {
    assert.equal(
      meetsLevelRequirements(1, stats({ lifetimeInvestmentCount: 3, completedInvestmentCount: 1 })),
      true
    );
    assert.equal(
      meetsLevelRequirements(1, stats({ lifetimeInvestmentCount: 3, completedInvestmentCount: 0 })),
      false
    );
    assert.equal(
      meetsLevelRequirements(1, stats({ lifetimeInvestmentCount: 2, completedInvestmentCount: 1 })),
      false
    );
  });

  it("level 2 requires 2 funds and 3 completed investments", () => {
    assert.equal(
      meetsLevelRequirements(
        2,
        stats({
          distinctFundsInvested: 2,
          completedInvestmentCount: 3,
        })
      ),
      true
    );
    assert.equal(
      meetsLevelRequirements(
        2,
        stats({
          distinctFundsInvested: 1,
          completedInvestmentCount: 3,
        })
      ),
      false
    );
  });

  it("level 3 requires 1 redeemed and 5 completed investments", () => {
    assert.equal(
      meetsLevelRequirements(
        3,
        stats({ redeemedCount: 1, completedInvestmentCount: 5 })
      ),
      true
    );
    assert.equal(
      meetsLevelRequirements(
        3,
        stats({ redeemedCount: 0, completedInvestmentCount: 5 })
      ),
      false
    );
  });

  it("level 4 requires 1 qualified referral", () => {
    assert.equal(
      meetsLevelRequirements(4, stats({ qualifiedReferralCount: 1 })),
      true
    );
    assert.equal(
      meetsLevelRequirements(4, stats({ qualifiedReferralCount: 0 })),
      false
    );
  });

  it("level 5 requires 4 funds, 10 completed, and 3 inviter-bonus referrals", () => {
    const eligible = stats({
      distinctFundsInvested: 4,
      completedInvestmentCount: 10,
      qualifiedInviterBonusReferralCount: 3,
    });
    assert.equal(meetsLevelRequirements(5, eligible), true);
    assert.equal(
      meetsLevelRequirements(
        5,
        stats({
          ...eligible,
          qualifiedInviterBonusReferralCount: 2,
        })
      ),
      false
    );
  });

  it("computeEarnedLevel stops at the first unmet level", () => {
    assert.equal(
      computeEarnedLevel(
        stats({
          lifetimeInvestmentCount: 3,
          completedInvestmentCount: 1,
        })
      ),
      1
    );

    assert.equal(
      computeEarnedLevel(
        stats({
          lifetimeInvestmentCount: 5,
          completedInvestmentCount: 3,
          distinctFundsInvested: 2,
        })
      ),
      2
    );

    assert.equal(
      computeEarnedLevel(
        stats({
          lifetimeInvestmentCount: 12,
          completedInvestmentCount: 10,
          redeemedCount: 1,
          distinctFundsInvested: 4,
          qualifiedReferralCount: 1,
          qualifiedInviterBonusReferralCount: 2,
        })
      ),
      4
    );

    assert.equal(
      computeEarnedLevel(
        stats({
          lifetimeInvestmentCount: 12,
          completedInvestmentCount: 10,
          redeemedCount: 3,
          distinctFundsInvested: 4,
          qualifiedReferralCount: 3,
          qualifiedInviterBonusReferralCount: 3,
        })
      ),
      5
    );
  });
});
