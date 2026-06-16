import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCumulativePowerGrants,
  getEffectiveSlotsPerFund,
  getPlayerLevelDefinition,
  getPlayerLevelPerks,
  getPowerGrantsForLevel,
  normalizePlayerLevel,
  PLAYER_LEVELS,
} from "./playerLevels";

describe("playerLevels", () => {
  it("defines six levels from 0 through 5", () => {
    assert.equal(PLAYER_LEVELS.length, 6);
    assert.deepEqual(
      PLAYER_LEVELS.map((entry) => entry.level),
      [0, 1, 2, 3, 4, 5]
    );
  });

  it("normalizes invalid levels to 0", () => {
    assert.equal(normalizePlayerLevel(undefined), 0);
    assert.equal(normalizePlayerLevel(-1), 0);
    assert.equal(normalizePlayerLevel(99), 5);
  });

  it("returns starter perks for level 0", () => {
    assert.deepEqual(getPlayerLevelPerks(0), {
      slotsPerFund: 1,
      maxTotalOpenInvestments: 3,
      powerGrants: { referral_recovery: 1, term_extension: 1 },
    });
    assert.equal(getPlayerLevelDefinition(0).title, "Starter");
  });

  it("clamps effective per-fund slots to catalog max", () => {
    assert.equal(getEffectiveSlotsPerFund(0, 5), 1);
    assert.equal(getEffectiveSlotsPerFund(4, 5), 5);
    assert.equal(getEffectiveSlotsPerFund(4, 3), 3);
    assert.equal(getEffectiveSlotsPerFund(5, 5), 5);
    assert.equal(getEffectiveSlotsPerFund(5, 10), 10);
  });

  it("returns per-level power grants", () => {
    assert.deepEqual(getPowerGrantsForLevel(1), {
      referral_recovery: 2,
      term_extension: 1,
    });
  });

  it("sums cumulative power grants through current level", () => {
    assert.deepEqual(getCumulativePowerGrants(0), {
      referral_recovery: 1,
      term_extension: 1,
    });
    assert.deepEqual(getCumulativePowerGrants(1), {
      referral_recovery: 3,
      term_extension: 2,
    });
    assert.deepEqual(getCumulativePowerGrants(4), {
      referral_recovery: 15,
      term_extension: 14,
    });
    assert.deepEqual(getCumulativePowerGrants(5), {
      referral_recovery: 22,
      term_extension: 21,
    });
  });
});
