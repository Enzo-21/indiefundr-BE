import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReferralPayoutOrderKind } from "@prisma/client";
import type { LedgerSnapshot } from "@/services/revenueEngine/ledger";
import { assertReferralLedgerLiquidity } from "./referralPayoutOrderFulfillment";

function baseLedgerSnapshot(
  overrides: Partial<LedgerSnapshot> = {}
): LedgerSnapshot {
  return {
    poolAvailable: 100,
    treasurySurplus: 10,
    protectedRevenueCredited: 0,
    protectedRevenueWithdrawn: 0,
    poolLiquidity: 90,
    protectedRevenueAvailable: 0,
    subscriberSlotsCredited: 0,
    subscriberSlotsConsumed: 0,
    subscriberSlotsAvailable: 0,
    version: 1,
    ...overrides,
  };
}

describe("assertReferralLedgerLiquidity", () => {
  it("rejects invitee bonus when treasury surplus is too low", () => {
    assert.throws(
      () =>
        assertReferralLedgerLiquidity(
          ReferralPayoutOrderKind.invitee_bonus,
          2,
          baseLedgerSnapshot({ treasurySurplus: 1 })
        ),
      /Insufficient treasury surplus/
    );
  });

  it("rejects principal recovery when pool liquidity is too low", () => {
    assert.throws(
      () =>
        assertReferralLedgerLiquidity(
          ReferralPayoutOrderKind.principal_recovery,
          25,
          baseLedgerSnapshot({ poolAvailable: 10 })
        ),
      /Insufficient pool liquidity/
    );
  });

  it("allows bonus payout when surplus covers amount", () => {
    assert.doesNotThrow(() =>
      assertReferralLedgerLiquidity(
        ReferralPayoutOrderKind.inviter_bonus,
        2,
        baseLedgerSnapshot({ treasurySurplus: 2 })
      )
    );
  });
});
