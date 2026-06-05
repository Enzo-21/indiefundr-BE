import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  PurchaseOrderStep,
} from "@prisma/client";
import {
  automaticFulfillmentOrderFilter,
  isManualFulfillmentOrder,
} from "./purchaseOrderManual";
import {
  buildOrderSettlementView,
  settlementLabelForOrder,
} from "./orderSettlementView";

describe("purchaseOrderManual", () => {
  it("detects manual fulfillment orders", () => {
    assert.equal(
      isManualFulfillmentOrder({
        fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
      }),
      true
    );
    assert.equal(
      isManualFulfillmentOrder({
        fulfillmentMode: PurchaseOrderFulfillmentMode.automatic,
      }),
      false
    );
  });

  it("excludes manual orders from automatic reconcile filter", () => {
    assert.deepEqual(automaticFulfillmentOrderFilter(), {
      NOT: { fulfillmentMode: PurchaseOrderFulfillmentMode.manual },
    });
  });

  it("labels manual steps for UI", () => {
    const order = {
      fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
      status: PurchaseOrderStatus.queued,
      step: PurchaseOrderStep.awaiting_trx,
      failureReason: null,
      paymentChainOutcome: null,
    } as const;

    const view = buildOrderSettlementView(order as never);
    assert.equal(view.displayStatus, "pending");
    assert.equal(
      settlementLabelForOrder(order as never, view.phase),
      "Submitted"
    );
  });
});
