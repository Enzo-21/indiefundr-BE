import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FeeSponsorshipMode } from "@prisma/client";
import {
  formatTreasuryInsufficientForTopUpError,
  shouldRecoverSponsoredTrx,
} from "./resourceSponsorship";

describe("formatTreasuryInsufficientForTopUpError", () => {
  it("includes need, balance, and retry guidance", () => {
    assert.equal(
      formatTreasuryInsufficientForTopUpError(0.75, 0.12),
      "Treasury TRX insufficient for top-up: need 0.75 TRX, treasury has 0.12 TRX. Fund treasury and retry."
    );
  });
});

describe("shouldRecoverSponsoredTrx", () => {
  it("returns false when already swept", () => {
    assert.equal(
      shouldRecoverSponsoredTrx({
        sponsorshipMode: FeeSponsorshipMode.trx_topup,
        sponsoredTrx: 5,
        sweepTxId: "abc",
      }),
      false
    );
  });

  it("returns false when no sponsored TRX", () => {
    assert.equal(
      shouldRecoverSponsoredTrx({
        sponsorshipMode: FeeSponsorshipMode.trx_topup,
        sponsoredTrx: 0,
        sweepTxId: null,
      }),
      false
    );
  });

  it("returns false for user_resources mode", () => {
    assert.equal(
      shouldRecoverSponsoredTrx({
        sponsorshipMode: FeeSponsorshipMode.user_resources,
        sponsoredTrx: 5,
        sweepTxId: null,
      }),
      false
    );
  });

  it("returns true for trx_topup with sponsored balance", () => {
    assert.equal(
      shouldRecoverSponsoredTrx({
        sponsorshipMode: FeeSponsorshipMode.trx_topup,
        sponsoredTrx: 3.5,
        sweepTxId: null,
      }),
      true
    );
  });

  it("returns true when mode is null but sponsored TRX remains (legacy)", () => {
    assert.equal(
      shouldRecoverSponsoredTrx({
        sponsorshipMode: null,
        sponsoredTrx: 2,
        sweepTxId: null,
      }),
      true
    );
  });
});
