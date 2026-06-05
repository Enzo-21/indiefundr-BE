import { PurchaseOrderStatus } from "@prisma/client";

export const FAILED_ACTIVITY_MATCH_WINDOW_MS = 5 * 60 * 1000;

export type FailedOrderMatchInput = {
  status: PurchaseOrderStatus;
  fundId: string;
  costUsdt: number;
  usdtTxId: string | null;
  date: Date;
  updatedAt: Date;
};

export type FailedInvestmentMatchInput = {
  fundId: string;
  amountUsdt: number;
  date: Date;
};

/** True when a failed purchase order represents the same subscribe attempt as a FailedInvestment row. */
export function failedOrderCoversFailedInvestment(
  order: FailedOrderMatchInput,
  item: FailedInvestmentMatchInput,
  itemTxId: string | null
): boolean {
  if (order.status !== PurchaseOrderStatus.failed) {
    return false;
  }
  if (order.fundId !== item.fundId || order.costUsdt !== item.amountUsdt) {
    return false;
  }
  if (order.usdtTxId && itemTxId && order.usdtTxId === itemTxId) {
    return true;
  }
  const orderMs = (order.updatedAt || order.date).getTime();
  return Math.abs(orderMs - item.date.getTime()) <= FAILED_ACTIVITY_MATCH_WINDOW_MS;
}
