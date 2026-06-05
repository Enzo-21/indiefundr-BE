import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickWalletActivationTxId, type TrxTransferRow } from "./client";
import {
  activationResultToSyncStatus,
  isDailyActivationCapReached,
  isTreasuryTooLowForActivation,
} from "./walletActivation";

describe("walletActivation guards", () => {
  it("isDailyActivationCapReached at cap boundary", () => {
    assert.equal(isDailyActivationCapReached(499, 500), false);
    assert.equal(isDailyActivationCapReached(500, 500), true);
    assert.equal(isDailyActivationCapReached(501, 500), true);
  });

  it("isTreasuryTooLowForActivation includes activation cost and reserve", () => {
    assert.equal(isTreasuryTooLowForActivation(50.09, 0.1, 50), true);
    assert.equal(isTreasuryTooLowForActivation(50.1, 0.1, 50), false);
    assert.equal(isTreasuryTooLowForActivation(100, 0.1, 50), false);
  });
});

describe("pickWalletActivationTxId", () => {
  const treasury = "TYmx4ac3jcoVcsdxNfJYRxW7Vw6BLgyRuW";
  const activatedAt = new Date("2026-05-24T19:08:06.867Z");

  it("selects treasury TRX transfer matching activation amount", () => {
    const transfers: TrxTransferRow[] = [
      {
        txId: "fee-topup",
        from: treasury,
        to: "TUser",
        amountTrx: 3.05,
        date: new Date("2026-05-24T19:59:00.000Z"),
        contractRet: "SUCCESS",
      },
      {
        txId: "activation-tx",
        from: treasury,
        to: "TUser",
        amountTrx: 0.1,
        date: activatedAt,
        contractRet: "SUCCESS",
      },
    ];

    const txId = pickWalletActivationTxId(transfers, {
      treasuryAddress: treasury,
      expectedAmountTrx: 0.1,
      activatedAt,
    });

    assert.equal(txId, "activation-tx");
  });

  it("returns null when no matching activation transfer", () => {
    const transfers: TrxTransferRow[] = [
      {
        txId: "fee-topup",
        from: treasury,
        to: "TUser",
        amountTrx: 3.05,
        date: new Date(),
        contractRet: "SUCCESS",
      },
    ];

    assert.equal(
      pickWalletActivationTxId(transfers, {
        treasuryAddress: treasury,
        expectedAmountTrx: 0.1,
        activatedAt,
      }),
      null
    );
  });
});

describe("activationResultToSyncStatus", () => {
  it("maps activated and already_active to ready", () => {
    assert.equal(
      activationResultToSyncStatus({ status: "activated", txId: "abc" }),
      "ready"
    );
    assert.equal(
      activationResultToSyncStatus({ status: "already_active" }),
      "ready"
    );
  });

  it("maps pending to pending", () => {
    assert.equal(
      activationResultToSyncStatus({ status: "pending", txId: "abc" }),
      "pending"
    );
  });

  it("maps failed and skipped statuses to failed", () => {
    assert.equal(
      activationResultToSyncStatus({ status: "failed", error: "x" }),
      "failed"
    );
    assert.equal(
      activationResultToSyncStatus({ status: "skipped_cap" }),
      "failed"
    );
    assert.equal(
      activationResultToSyncStatus({
        status: "skipped_treasury_low",
      }),
      "failed"
    );
  });

  it("maps disabled to ready", () => {
    assert.equal(
      activationResultToSyncStatus({ status: "disabled" }),
      "ready"
    );
  });
});
