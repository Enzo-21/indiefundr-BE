import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PurchaseOrder } from "@prisma/client";
import type { ChainTxInspection } from "./client";
import {
  chainOutcomeImpliesSettlementPending,
  collectPaymentTxIdsFromOrder,
  resolvePaymentFromTxIds,
} from "./usdtPaymentChainTruth";

function mockOrder(
  overrides: Partial<PurchaseOrder> = {}
): PurchaseOrder {
  return {
    id: "order-1",
    userId: "user-1",
    walletId: "wallet-1",
    fundId: "fund-a",
    costUsdt: 25,
    usdtTxId: null,
    failedUsdtTxIds: [],
    investmentId: null,
    status: "failed",
    step: "done",
    failureReason: "test",
    date: new Date(),
    updatedAt: new Date(),
    reservedUsdt: 25,
    sponsoredTrx: 0,
    topUpTxId: null,
    sweepTxId: null,
    estimatedTrx: 0,
    sponsorRound: 0,
    device: null,
    queuedAt: null,
    ...overrides,
  } as PurchaseOrder;
}

function inspection(
  txId: string,
  opts: {
    success?: boolean;
    status?: "pending" | "success" | "failed";
    lookupFailed?: boolean;
  }
): ChainTxInspection {
  const success = opts.success ?? false;
  return {
    txId,
    transactionInfo: success ? { id: txId, receipt: { result: "SUCCESS" } } : null,
    transaction: null,
    status: opts.status ?? (success ? "success" : "failed"),
    usdtTransferSuccessful: success,
    lookupFailed: opts.lookupFailed,
  };
}

describe("chainOutcomeImpliesSettlementPending", () => {
  it("treats unknown chain lookups as not blocking settlement", () => {
    assert.equal(chainOutcomeImpliesSettlementPending("unknown"), false);
  });

  it("treats failed and pending as needing settlement", () => {
    assert.equal(chainOutcomeImpliesSettlementPending("failed"), true);
    assert.equal(chainOutcomeImpliesSettlementPending("pending"), true);
  });
});

describe("collectPaymentTxIdsFromOrder", () => {
  it("includes usdtTxId and failedUsdtTxIds without duplicates", () => {
    const ids = collectPaymentTxIdsFromOrder(
      mockOrder({
        usdtTxId: "tx-a",
        failedUsdtTxIds: ["tx-b", "tx-a"],
      })
    );
    assert.deepEqual(ids, ["tx-a", "tx-b"]);
  });
});

describe("resolvePaymentFromTxIds", () => {
  it("returns success when a later failedUsdtTxId succeeded on-chain", async () => {
    const inspect = async (txId: string) => {
      if (txId === "tx-success") {
        return inspection(txId, { success: true });
      }
      return inspection(txId, { status: "failed" });
    };

    const resolution = await resolvePaymentFromTxIds(
      ["tx-failed-attempt", "tx-success"],
      inspect
    );
    assert.equal(resolution.outcome, "success");
    assert.equal(resolution.winningTxId, "tx-success");
  });

  it("returns unknown when all lookups fail", async () => {
    const resolution = await resolvePaymentFromTxIds(["tx-1"], async (txId) =>
      inspection(txId, { lookupFailed: true, status: "pending" })
    );
    assert.equal(resolution.outcome, "unknown");
  });

  it("returns pending when no success and a tx is still pending", async () => {
    const resolution = await resolvePaymentFromTxIds(
      ["tx-1", "tx-2"],
      async (txId) =>
        txId === "tx-1"
          ? inspection(txId, { status: "pending" })
          : inspection(txId, { status: "failed" })
    );
    assert.equal(resolution.outcome, "pending");
  });
});
