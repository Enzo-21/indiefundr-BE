import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  type PurchaseOrder,
} from "@prisma/client";
import { isManualFulfillmentOrder } from "@/services/orders/purchaseOrderManual";

/** Mirrors reconcileOrdersForActivity candidate filter. */
function activityHealCandidates(orders: PurchaseOrder[]): PurchaseOrder[] {
  return orders.filter(
    (order) =>
      !isManualFulfillmentOrder(order) &&
      (order.status === PurchaseOrderStatus.failed ||
        order.status === PurchaseOrderStatus.processing)
  );
}

describe("reconcileOrdersForActivity manual filter", () => {
  it("excludes manual fulfillment orders from heal candidates", () => {
    const manual = {
      status: PurchaseOrderStatus.processing,
      fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
    } as PurchaseOrder;
    const automatic = {
      status: PurchaseOrderStatus.processing,
      fulfillmentMode: PurchaseOrderFulfillmentMode.automatic,
    } as PurchaseOrder;

    const candidates = activityHealCandidates([manual, automatic]);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.fulfillmentMode, PurchaseOrderFulfillmentMode.automatic);
  });
});
