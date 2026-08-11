import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FeeSponsorshipMode } from "@prisma/client";
import {
  computeTrxTopUpAmount,
  formatTreasuryInsufficientForTopUpError,
  shouldRecoverSponsoredTrx,
} from "./resourceSponsorship";

describe("computeTrxTopUpAmount", () => {
  it("uses max(estimated, minEstimated) with 1.5× buffer", () => {
    const r = computeTrxTopUpAmount(
      { estimatedTrx: 10, trxBalance: 1, canTransferZeroBurn: false },
      20
    );
    assert.equal(r.neededTrx, 20);
    assert.equal(r.targetTrx, 30);
    assert.equal(r.amountTrx, 29);
  });

  it("forces a floor when resource shortfall but formula would skip", () => {
    const r = computeTrxTopUpAmount({
      estimatedTrx: 0.05,
      trxBalance: 0.1,
      canTransferZeroBurn: false,
      energyShortfall: 100_000,
    });
    assert.ok(r.amountTrx > 0);
    assert.equal(r.amountTrx, 0.5);
  });

  it("skips when zero-burn and wallet covers estimate", () => {
    const r = computeTrxTopUpAmount({
      estimatedTrx: 1,
      trxBalance: 2,
      canTransferZeroBurn: true,
    });
    assert.equal(r.amountTrx, 0);
  });
});

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
