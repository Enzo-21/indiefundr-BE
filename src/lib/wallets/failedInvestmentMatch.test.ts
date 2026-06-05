import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PurchaseOrderStatus } from "@prisma/client";
import {
  FAILED_ACTIVITY_MATCH_WINDOW_MS,
  failedOrderCoversFailedInvestment,
} from "./failedInvestmentMatch";

describe("failedOrderCoversFailedInvestment", () => {
  const baseOrder = {
    status: PurchaseOrderStatus.failed,
    fundId: "growth",
    costUsdt: 25,
    usdtTxId: null as string | null,
    date: new Date("2026-05-01T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T12:00:00.000Z"),
  };

  it("matches when usdtTxId equals failed investment tx", () => {
    assert.equal(
      failedOrderCoversFailedInvestment(
        { ...baseOrder, usdtTxId: "tx-abc" },
        { fundId: "growth", amountUsdt: 25, date: new Date() },
        "tx-abc"
      ),
      true
    );
  });

  it("matches within time window for same fund and amount", () => {
    const itemDate = new Date(baseOrder.updatedAt.getTime() + 60_000);
    assert.equal(
      failedOrderCoversFailedInvestment(
        baseOrder,
        { fundId: "growth", amountUsdt: 25, date: itemDate },
        null
      ),
      true
    );
    assert.equal(
      failedOrderCoversFailedInvestment(
        baseOrder,
        {
          fundId: "growth",
          amountUsdt: 25,
          date: new Date(
            baseOrder.updatedAt.getTime() + FAILED_ACTIVITY_MATCH_WINDOW_MS + 1
          ),
        },
        null
      ),
      false
    );
  });

  it("does not match processing orders", () => {
    assert.equal(
      failedOrderCoversFailedInvestment(
        { ...baseOrder, status: PurchaseOrderStatus.processing },
        { fundId: "growth", amountUsdt: 25, date: baseOrder.date },
        null
      ),
      false
    );
  });
});
