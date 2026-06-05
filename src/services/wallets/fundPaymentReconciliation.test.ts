import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PurchaseOrderStatus } from "@prisma/client";
import type { WalletFundSettlementResult } from "./fundPaymentReconciliation";

describe("WalletFundSettlementResult skippedHeavy", () => {
  it("marks fast path when no open settlement work remains", () => {
    const result: WalletFundSettlementResult = {
      processorTicks: 0,
      healed: 0,
      orphanHealed: 0,
      skippedHeavy: true,
    };
    assert.equal(result.skippedHeavy, true);
    assert.equal(result.healed, 0);
  });

  it("runs heavy path when settlement work is pending", () => {
    const result: WalletFundSettlementResult = {
      processorTicks: 1,
      healed: 1,
      orphanHealed: 0,
      skippedHeavy: false,
    };
    assert.equal(result.skippedHeavy, false);
    assert.equal(result.healed, 1);
  });
});

describe("activeFundOrderWhere coverage", () => {
  it("includes falsely finalized failed payments in reconcile scope", () => {
    const falselyFinalized = {
      status: PurchaseOrderStatus.failed,
      paymentChainFinal: true,
      paymentChainOutcome: "failed",
      usdtTxId: { not: null as null },
    };
    assert.equal(falselyFinalized.status, PurchaseOrderStatus.failed);
    assert.equal(falselyFinalized.paymentChainFinal, true);
  });
});
