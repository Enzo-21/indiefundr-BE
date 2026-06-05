import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeAdminRecoverableTrx,
  computeAdminTrxTopUpAmount,
  resolveAdminTransactionStatusFromInspection,
} from "./purchaseOrderFulfillment";

describe("computeAdminRecoverableTrx", () => {
  it("returns recoverable amount above reserve capped by sponsored TRX when sweep fee is zero", () => {
    assert.equal(
      computeAdminRecoverableTrx({
        sponsoredTrx: 4,
        currentTrxBalance: 1.12,
        reserveTrx: 0.1,
        transferFeeTrx: 0,
      }),
      1.02
    );
  });

  it("subtracts sweep transfer fee from recoverable amount", () => {
    assert.equal(
      computeAdminRecoverableTrx({
        sponsoredTrx: 4,
        currentTrxBalance: 1.12,
        reserveTrx: 0.1,
        transferFeeTrx: 0.27,
      }),
      0.75
    );
  });

  it("returns zero when no sponsored TRX", () => {
    assert.equal(
      computeAdminRecoverableTrx({
        sponsoredTrx: 0,
        currentTrxBalance: 1.12,
        reserveTrx: 0.1,
        transferFeeTrx: 0.27,
      }),
      0
    );
  });

  it("returns zero when balance is below reserve plus sweep fee", () => {
    assert.equal(
      computeAdminRecoverableTrx({
        sponsoredTrx: 4,
        currentTrxBalance: 0.05,
        reserveTrx: 0.1,
        transferFeeTrx: 0.27,
      }),
      0
    );
  });

  it("ignores trxBefore-style subtraction when sweep fee is accounted for", () => {
    const recoverable = computeAdminRecoverableTrx({
      sponsoredTrx: 4,
      currentTrxBalance: 1.12,
      reserveTrx: 0.1,
      transferFeeTrx: 0.27,
    });
    assert.equal(recoverable, 0.75);
    const oldBrokenFormula = Math.max(0, 1.12 - 2.76 - 0.1);
    assert.equal(oldBrokenFormula, 0);
    const oldMissingFeeFormula = Math.max(0, 1.12 - 0.1);
    assert.equal(oldMissingFeeFormula, 1.02);
  });

  it("uses sun flooring and never rounds recoverable up", () => {
    assert.equal(
      computeAdminRecoverableTrx({
        sponsoredTrx: 4,
        currentTrxBalance: 1.1200004,
        reserveTrx: 0.1,
        transferFeeTrx: 0.268,
      }),
      0.752
    );
  });

  it("uses conservative full-bandwidth fee for production-like balance", () => {
    assert.equal(
      computeAdminRecoverableTrx({
        sponsoredTrx: 4.1392,
        currentTrxBalance: 1.12545,
        reserveTrx: 0.1,
        transferFeeTrx: 0.30935,
      }),
      0.7161
    );
  });
});

describe("computeAdminTrxTopUpAmount", () => {
  it("applies 50% buffer on estimate with zero wallet balance", () => {
    assert.equal(
      computeAdminTrxTopUpAmount({ estimatedTrx: 10, trxBalance: 0 }),
      15
    );
  });

  it("applies 50% buffer minus existing wallet balance", () => {
    assert.equal(
      computeAdminTrxTopUpAmount({ estimatedTrx: 10, trxBalance: 2 }),
      13
    );
  });

  it("uses minEstimatedTrx when higher than estimate", () => {
    assert.equal(
      computeAdminTrxTopUpAmount({ estimatedTrx: 8, trxBalance: 0 }, 12),
      18
    );
  });
});

describe("resolveAdminTransactionStatusFromInspection", () => {
  it("returns pending when chain lookup fails", () => {
    const result = resolveAdminTransactionStatusFromInspection({
      txId: "abc",
      transactionInfo: null,
      transaction: null,
      status: "pending",
      usdtTransferSuccessful: false,
      lookupFailed: true,
    });
    assert.equal(result.status, "pending");
  });

  it("returns retryable failed with feeTrx for OUT_OF_ENERGY USDT tx", () => {
    const result = resolveAdminTransactionStatusFromInspection(
      {
        txId: "energy-fail",
        transactionInfo: {
          id: "energy-fail",
          receipt: { result: "OUT_OF_ENERGY", energy_fee: 12_000_000 },
        },
        transaction: { ret: [{ contractRet: "REVERT" }] },
        status: "failed",
        usdtTransferSuccessful: false,
      },
      { expectUsdtTransfer: true }
    );
    assert.equal(result.status, "failed");
    assert.equal(result.retryable, true);
    assert.equal(result.feeTrx, 12);
  });

  it("returns success only when USDT transfer succeeded", () => {
    const result = resolveAdminTransactionStatusFromInspection(
      {
        txId: "usdt-ok",
        transactionInfo: { id: "usdt-ok", receipt: { result: "SUCCESS" } },
        transaction: { ret: [{ contractRet: "SUCCESS" }] },
        status: "success",
        usdtTransferSuccessful: true,
      },
      { expectUsdtTransfer: true }
    );
    assert.equal(result.status, "success");
  });

  it("keeps pending when failure reason is missing tx info", () => {
    const result = resolveAdminTransactionStatusFromInspection({
      txId: "missing",
      transactionInfo: null,
      transaction: { ret: [{ contractRet: "REVERT" }] },
      status: "failed",
      usdtTransferSuccessful: false,
    });
    assert.equal(result.status, "pending");
  });
});
