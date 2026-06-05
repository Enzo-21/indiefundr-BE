import {
  PurchaseOrderStatus,
  WithdrawalOrderStatus,
  type Wallet,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import * as tron from "@/services/tron/client";

export const ACTIVE_PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.queued,
  PurchaseOrderStatus.processing,
];

export const ACTIVE_WITHDRAWAL_ORDER_STATUSES: WithdrawalOrderStatus[] = [
  WithdrawalOrderStatus.queued,
  WithdrawalOrderStatus.processing,
];

/** @deprecated Use ACTIVE_PURCHASE_ORDER_STATUSES */
export const ACTIVE_STATUSES = ACTIVE_PURCHASE_ORDER_STATUSES;

export async function getReservedUsdtForPurchaseOrders(
  walletId: string,
  excludeOrderId?: string | null
): Promise<number> {
  const rows = await prisma.purchaseOrder.findMany({
    where: {
      walletId,
      status: { in: ACTIVE_PURCHASE_ORDER_STATUSES },
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
    },
    select: { reservedUsdt: true },
  });
  return rows.reduce((sum, row) => sum + (row.reservedUsdt || 0), 0);
}

export async function getReservedUsdtForWithdrawals(
  walletId: string,
  excludeOrderId?: string | null
): Promise<number> {
  const rows = await prisma.withdrawalOrder.findMany({
    where: {
      walletId,
      status: { in: ACTIVE_WITHDRAWAL_ORDER_STATUSES },
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
    },
    select: { reservedUsdt: true },
  });
  return rows.reduce((sum, row) => sum + (row.reservedUsdt || 0), 0);
}

export async function getReservedUsdtForWallet(
  walletId: string,
  opts?: {
    excludePurchaseOrderId?: string | null;
    excludeWithdrawalOrderId?: string | null;
  }
): Promise<number> {
  const [purchase, withdrawal] = await Promise.all([
    getReservedUsdtForPurchaseOrders(
      walletId,
      opts?.excludePurchaseOrderId
    ),
    getReservedUsdtForWithdrawals(walletId, opts?.excludeWithdrawalOrderId),
  ]);
  return parseFloat((purchase + withdrawal).toFixed(4));
}

export async function getWalletUsdtAvailability(
  wallet: Pick<Wallet, "id" | "address">,
  {
    excludeOrderId = null,
    excludeWithdrawalOrderId = null,
  }: {
    excludeOrderId?: string | null;
    excludeWithdrawalOrderId?: string | null;
  } = {}
) {
  const rawOnChainUsdt = await tron.getUsdtBalance(wallet.address);
  const pendingInbound = await tron.getPendingIncomingUsdtTotal(wallet.address);
  const onChainUsdt = tron.subtractPendingInboundUsdt(
    rawOnChainUsdt,
    pendingInbound
  );
  const reservedUsdt = await getReservedUsdtForWallet(wallet.id, {
    excludePurchaseOrderId: excludeOrderId,
    excludeWithdrawalOrderId,
  });
  const availableUsdt = parseFloat(
    Math.max(0, onChainUsdt - reservedUsdt).toFixed(4)
  );
  const [pendingOrdersCount, pendingWithdrawalsCount] = await Promise.all([
    prisma.purchaseOrder.count({
      where: {
        walletId: wallet.id,
        status: { in: ACTIVE_PURCHASE_ORDER_STATUSES },
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      },
    }),
    prisma.withdrawalOrder.count({
      where: {
        walletId: wallet.id,
        status: { in: ACTIVE_WITHDRAWAL_ORDER_STATUSES },
        ...(excludeWithdrawalOrderId
          ? { id: { not: excludeWithdrawalOrderId } }
          : {}),
      },
    }),
  ]);

  return {
    onChainUsdt,
    reservedUsdt,
    availableUsdt,
    pendingOrdersCount,
    pendingWithdrawalsCount,
  };
}

export async function getActiveOrderForUser(
  userId: string,
  fundId?: string | null
) {
  return prisma.purchaseOrder.findFirst({
    where: {
      userId,
      status: { in: ACTIVE_PURCHASE_ORDER_STATUSES },
      ...(fundId ? { fundId } : {}),
    },
    orderBy: { date: "desc" },
    include: {
      wallet: { select: { address: true, name: true } },
    },
  });
}

export async function getActiveWithdrawalForUser(userId: string) {
  return prisma.withdrawalOrder.findFirst({
    where: {
      userId,
      status: { in: ACTIVE_WITHDRAWAL_ORDER_STATUSES },
    },
    orderBy: { date: "desc" },
    include: {
      wallet: { select: { address: true, name: true } },
    },
  });
}
