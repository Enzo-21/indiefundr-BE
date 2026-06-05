import {
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  WithdrawalOrderStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

const OPEN_PURCHASE_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.queued,
  PurchaseOrderStatus.processing,
];

const OPEN_WITHDRAWAL_STATUSES: WithdrawalOrderStatus[] = [
  WithdrawalOrderStatus.queued,
  WithdrawalOrderStatus.processing,
];

export type SiblingOpenOrderCounts = {
  investmentOrders: number;
  withdrawalOrders: number;
  total: number;
};

export function formatSiblingDeferRecoveryReason(
  counts: SiblingOpenOrderCounts
): string {
  const n = counts.total;
  const orderWord = n === 1 ? "order" : "orders";
  return `Skipped — ${n} other open ${orderWord} on this wallet still need TRX (saving sponsored TRX for the next order).`;
}

export async function countSiblingOpenOrders(params: {
  userId: string;
  walletId: string;
  excludePurchaseOrderId?: string;
  excludeWithdrawalOrderId?: string;
}): Promise<SiblingOpenOrderCounts> {
  const { userId, walletId, excludePurchaseOrderId, excludeWithdrawalOrderId } =
    params;

  const [investmentOrders, withdrawalOrders] = await Promise.all([
    prisma.purchaseOrder.count({
      where: {
        userId,
        walletId,
        fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
        status: { in: OPEN_PURCHASE_STATUSES },
        ...(excludePurchaseOrderId
          ? { id: { not: excludePurchaseOrderId } }
          : {}),
      },
    }),
    prisma.withdrawalOrder.count({
      where: {
        userId,
        walletId,
        status: { in: OPEN_WITHDRAWAL_STATUSES },
        ...(excludeWithdrawalOrderId
          ? { id: { not: excludeWithdrawalOrderId } }
          : {}),
      },
    }),
  ]);

  return {
    investmentOrders,
    withdrawalOrders,
    total: investmentOrders + withdrawalOrders,
  };
}

export async function getSiblingOpenOrdersForPurchaseOrder(
  purchaseOrderId: string
): Promise<SiblingOpenOrderCounts> {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { userId: true, walletId: true },
  });
  if (!order) {
    throw new Error("Purchase order not found");
  }

  return countSiblingOpenOrders({
    userId: order.userId,
    walletId: order.walletId,
    excludePurchaseOrderId: purchaseOrderId,
  });
}
