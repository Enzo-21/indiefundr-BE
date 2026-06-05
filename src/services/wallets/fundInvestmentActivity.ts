import type { PurchaseOrder } from "@prisma/client";
import { PurchaseOrderStatus } from "@prisma/client";
import { collectPaymentTxIdsFromOrder } from "@/services/tron/usdtPaymentChainTruth";

/** User-visible fund investment activity (one row per purchase order). */
export type FundInvestmentActivityShape = {
  orderId: string;
  fundId: string;
  amountUsdt: number;
  activityId: string;
  txId: string | null;
  phase: string;
  displayStatus: string;
  settlementLabel: string;
};

export function fundInvestmentActivityId(orderId: string): string {
  return `purchase-order-${orderId}`;
}

/** Tx ids that must not appear as separate failed chain rows. */
export function buildHiddenFailedUsdtTxIds(
  orders: Array<{
    id: string;
    status: PurchaseOrderStatus;
    usdtTxId: string | null;
    failedUsdtTxIds: string[];
  }>
): Set<string> {
  const hidden = new Set<string>();
  for (const order of orders) {
    for (const txId of order.failedUsdtTxIds ?? []) {
      if (!txId) continue;
      if (order.usdtTxId && txId === order.usdtTxId) {
        continue;
      }
      hidden.add(txId);
    }
  }
  return hidden;
}

export function buildOpenPurchaseOrderIds(
  orders: Array<{ id: string; status: PurchaseOrderStatus }>
): Set<string> {
  return new Set(
    orders
      .filter(
        (order) =>
          order.status === PurchaseOrderStatus.processing ||
          order.status === PurchaseOrderStatus.queued
      )
      .map((order) => order.id)
  );
}

export function shouldSkipInvestmentActivityRow(
  order: Pick<PurchaseOrder, "id" | "status"> | null | undefined,
  deferInvestmentUntilConfirm: boolean
): boolean {
  if (!deferInvestmentUntilConfirm || !order) {
    return false;
  }
  return (
    order.status === PurchaseOrderStatus.processing ||
    order.status === PurchaseOrderStatus.queued
  );
}

export function orderToFundInvestmentShape(
  order: PurchaseOrder,
  settlement: {
    phase: string;
    displayStatus: string;
    settlementLabel: string;
  }
): FundInvestmentActivityShape {
  return {
    orderId: order.id,
    fundId: order.fundId,
    amountUsdt: order.costUsdt,
    activityId: fundInvestmentActivityId(order.id),
    txId: order.usdtTxId,
    phase: settlement.phase,
    displayStatus: settlement.displayStatus,
    settlementLabel: settlement.settlementLabel,
  };
}

export function collectWinningPaymentTxIds(
  orders: Array<{
    usdtTxId: string | null;
    failedUsdtTxIds: string[];
    paymentChainOutcome: string | null;
    status: PurchaseOrderStatus;
  }>
): Set<string> {
  const winning = new Set<string>();
  for (const order of orders) {
    if (order.paymentChainOutcome === "success") {
      for (const txId of collectPaymentTxIdsFromOrder(order as PurchaseOrder)) {
        winning.add(txId);
      }
    }
    if (order.status === PurchaseOrderStatus.completed && order.usdtTxId) {
      winning.add(order.usdtTxId);
    }
  }
  return winning;
}
