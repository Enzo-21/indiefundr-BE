import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPowerInventory,
  serializePowerCards,
} from "./playerPowers";

describe("playerPowers", () => {
  it("builds available inventory from grants minus used", () => {
    const inventory = buildPowerInventory(1, {
      referral_recovery: 1,
      term_extension: 0,
    });

    assert.deepEqual(inventory.referral_recovery, {
      granted: 3,
      used: 1,
      available: 2,
    });
    assert.deepEqual(inventory.term_extension, {
      granted: 2,
      used: 0,
      available: 2,
    });
  });

  it("never returns negative availability", () => {
    const inventory = buildPowerInventory(0, {
      referral_recovery: 5,
      term_extension: 5,
    });

    assert.equal(inventory.referral_recovery.available, 0);
    assert.equal(inventory.term_extension.available, 0);
  });

  it("serializes power cards for API responses", () => {
    const cards = serializePowerCards(
      buildPowerInventory(0, { referral_recovery: 0, term_extension: 0 })
    );

    assert.equal(cards.length, 2);
    assert.equal(cards[0]?.type, "referral_recovery");
    assert.equal(cards[0]?.available, 1);
    assert.equal(cards[1]?.type, "term_extension");
    assert.equal(cards[1]?.available, 1);
  });
});
