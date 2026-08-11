import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatTronTransferError,
  isSponsorshipCoverableFeeError,
} from "./tronErrors";

describe("isSponsorshipCoverableFeeError", () => {
  it("covers energy / bandwidth / insufficient trx messages", () => {
    assert.equal(
      isSponsorshipCoverableFeeError(new Error("OUT_OF_ENERGY")),
      true
    );
    assert.equal(
      isSponsorshipCoverableFeeError(new Error("Not enough bandwidth")),
      true
    );
    assert.equal(
      isSponsorshipCoverableFeeError(
        new Error("Not enough TRX for network fees")
      ),
      true
    );
  });

  it("does not cover clear USDT REVERT when amount is known", () => {
    assert.equal(
      isSponsorshipCoverableFeeError(new Error("REVERT opcode executed"), {
        amountUsdt: 50,
        usdtBalance: 50,
      }),
      false
    );
  });
});

describe("formatTronTransferError", () => {
  it("maps energy messages to INSUFFICIENT_TRX", () => {
    const payload = formatTronTransferError(new Error("out_of_energy"));
    assert.equal(payload.code, "INSUFFICIENT_TRX");
  });
});
