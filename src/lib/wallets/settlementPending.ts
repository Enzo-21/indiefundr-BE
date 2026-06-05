import { PurchaseOrderStatus, type PurchaseOrder } from "@prisma/client";

/** DB-only hint for orders that may still need on-chain settlement (no Tron calls). */
export function countSettlementPendingFromDb(orders: PurchaseOrder[]): number {
  return orders.filter((order) => orderLooksLikeSettlementPending(order)).length;
}

export function orderLooksLikeSettlementPending(order: PurchaseOrder): boolean {
  if (
    order.status !== PurchaseOrderStatus.processing &&
    order.status !== PurchaseOrderStatus.failed
  ) {
    return false;
  }

  const hasTx =
    Boolean(order.usdtTxId) || (order.failedUsdtTxIds?.length ?? 0) > 0;
  if (hasTx) {
    return true;
  }

  return order.status === PurchaseOrderStatus.processing;
}
