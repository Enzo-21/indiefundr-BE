import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PurchaseOrderStatus, PurchaseOrderStep } from "@prisma/client";
import {
  countSettlementPendingFromDb,
  orderLooksLikeSettlementPending,
} from "./settlementPending";

describe("settlementPending", () => {
  it("counts failed/processing orders with usdt tx ids", () => {
    const orders = [
      {
        status: PurchaseOrderStatus.failed,
        usdtTxId: "tx-1",
        failedUsdtTxIds: [],
      },
      {
        status: PurchaseOrderStatus.completed,
        usdtTxId: "tx-2",
        failedUsdtTxIds: [],
      },
    ] as Parameters<typeof countSettlementPendingFromDb>[0];

    assert.equal(countSettlementPendingFromDb(orders), 1);
  });

  it("counts processing orders without tx as settlement pending", () => {
    assert.equal(
      orderLooksLikeSettlementPending({
        status: PurchaseOrderStatus.processing,
        usdtTxId: null,
        failedUsdtTxIds: [],
      } as Parameters<typeof orderLooksLikeSettlementPending>[0]),
      true
    );
    assert.equal(
      orderLooksLikeSettlementPending({
        status: PurchaseOrderStatus.failed,
        usdtTxId: null,
        failedUsdtTxIds: [],
        step: PurchaseOrderStep.done,
      } as Parameters<typeof orderLooksLikeSettlementPending>[0]),
      false
    );
  });
});
