import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  PurchaseOrderStep,
} from "@prisma/client";
import {
  buildPendingOrderSubmittedTapInfo,
  getPendingPurchaseOrderTapInfo,
  isManualOrderAwaitingAdminReview,
  shouldShowPendingPurchaseOrderTapInfo,
} from "./walletActivityLabels";

describe("walletActivityLabels", () => {
  it("returns order submitted copy for manual orders awaiting admin review", () => {
    const order = {
      fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
      step: PurchaseOrderStep.awaiting_review,
      status: PurchaseOrderStatus.processing,
      usdtTxId: "abc123",
      topUpTxId: null,
      sponsoredTrx: 0,
      failureReason: null,
    };

    assert.equal(isManualOrderAwaitingAdminReview(order), true);
    assert.equal(
      getPendingPurchaseOrderTapInfo(order, "High Roller Syndicate")?.title,
      "Order submitted"
    );
    assert.match(
      getPendingPurchaseOrderTapInfo(order, "High Roller Syndicate")?.message ??
        "",
      /72 business hours/
    );
  });

  it("shows pending tap info for manual confirming orders awaiting admin review", () => {
    const order = {
      fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
      step: PurchaseOrderStep.awaiting_review,
      status: PurchaseOrderStatus.processing,
      usdtTxId: "abc123",
      topUpTxId: null,
      sponsoredTrx: 0,
      failureReason: null,
    };

    assert.equal(
      shouldShowPendingPurchaseOrderTapInfo(order, "pending", "confirming"),
      true
    );
  });

  it("builds concise submitted copy for new orders", () => {
    const copy = buildPendingOrderSubmittedTapInfo("Balanced Growth");
    assert.equal(copy.title, "Order submitted");
    assert.match(copy.message, /Balanced Growth/);
  });
});
