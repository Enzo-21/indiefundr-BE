import {
  PurchaseOrderFulfillmentMode,
  type PurchaseOrder,
} from "@prisma/client";

export function isManualFulfillmentOrder(
  order: Pick<PurchaseOrder, "fulfillmentMode">
): boolean {
  return order.fulfillmentMode === PurchaseOrderFulfillmentMode.manual;
}

/** Excludes manual admin queue from automatic reconcile queries. */
export function automaticFulfillmentOrderFilter(): {
  NOT: { fulfillmentMode: PurchaseOrderFulfillmentMode };
} {
  return {
    NOT: { fulfillmentMode: PurchaseOrderFulfillmentMode.manual },
  };
}
