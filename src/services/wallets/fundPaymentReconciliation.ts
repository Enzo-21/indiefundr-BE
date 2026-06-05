import {
  Prisma,
  PurchaseOrderStatus,
  type FailedInvestment,
  type PurchaseOrder,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  cleanupRedundantFailedInvestments,
  tryDeleteRedundantFailedInvestment,
} from "@/services/orders/purchaseOrderChainMaintenance";
import {
  healOrphanPendingInvestments,
  healPurchaseOrderFromChainTruth,
} from "@/services/orders/purchaseOrderProcessor";
import {
  automaticFulfillmentOrderFilter,
  isManualFulfillmentOrder,
} from "@/services/orders/purchaseOrderManual";

const PURCHASE_ORDER_RECONCILE_MAX_PER_RUN = 50;
import { orderHasPaymentAttempt } from "@/services/orders/orderSettlementView";
import {
  collectPaymentTxIdsFromOrder,
} from "@/services/tron/usdtPaymentChainTruth";
import {
  persistOrderPaymentChainState,
  refreshOrderPaymentChainState,
} from "./paymentChainState";

export type WalletFundReconcileResult = {
  healed: number;
  outcomesSet: number;
  deletedFailedInv: number;
  ordersProcessed: number;
};

export type WalletFundSettlementResult = {
  processorTicks: number;
  healed: number;
  orphanHealed: number;
  skippedHeavy?: boolean;
};

const falselyFinalizedFailedWhere: Prisma.PurchaseOrderWhereInput = {
  status: PurchaseOrderStatus.failed,
  paymentChainFinal: true,
  paymentChainOutcome: "failed",
  OR: [
    { usdtTxId: { not: null } },
    { failedUsdtTxIds: { isEmpty: false } },
  ],
};

function activeFundOrderWhere(
  userId: string,
  walletId: string
): Prisma.PurchaseOrderWhereInput {
  return {
    userId,
    walletId,
    ...automaticFulfillmentOrderFilter(),
    OR: [
      {
        status: {
          in: [PurchaseOrderStatus.queued, PurchaseOrderStatus.processing],
        },
      },
      {
        status: PurchaseOrderStatus.failed,
        paymentChainFinal: false,
      },
      {
        paymentChainFinal: false,
        OR: [
          { usdtTxId: { not: null } },
          { failedUsdtTxIds: { isEmpty: false } },
        ],
      },
      falselyFinalizedFailedWhere,
    ],
  };
}

/** True when chain/DB settlement work may still be in flight for this wallet. */
export async function walletHasFundSettlementWork(
  userId: string,
  walletId: string
): Promise<boolean> {
  const openOrders = await prisma.purchaseOrder.count({
    where: activeFundOrderWhere(userId, walletId),
  });
  return openOrders > 0;
}

/** Shared settlement pass for portfolio and activity reads. */
export async function reconcileWalletFundSettlement(
  userId: string,
  walletId: string,
  {
    processorLimit = 3,
    orphanLimit = 20,
    forceHeavy = false,
    skipHeavy = false,
  }: {
    processorLimit?: number;
    orphanLimit?: number;
    forceHeavy?: boolean;
    skipHeavy?: boolean;
  } = {}
): Promise<WalletFundSettlementResult> {
  let processorTicks = 0;
  let healed = 0;
  let orphanHealed = 0;

  try {
    orphanHealed = await healOrphanPendingInvestments({
      userId,
      limit: orphanLimit,
    });

    const needsHeavy =
      !skipHeavy &&
      (forceHeavy || (await walletHasFundSettlementWork(userId, walletId)));
    if (!needsHeavy) {
      return {
        processorTicks: 0,
        healed: 0,
        orphanHealed,
        skippedHeavy: true,
      };
    }

    const result = await reconcileActiveFundOrders(userId, walletId);
    healed = result.healed;
  } catch (error) {
    console.error(
      "[fundReconcile] wallet settlement failed",
      userId,
      walletId,
      error instanceof Error ? error.message : error
    );
  }

  return { processorTicks, healed, orphanHealed, skippedHeavy: false };
}

/** Reconcile non-final fund orders for a wallet (lighter than full history pass). */
export async function reconcileActiveFundOrders(
  userId: string,
  walletId: string
): Promise<WalletFundReconcileResult> {
  const orders = await prisma.purchaseOrder.findMany({
    where: activeFundOrderWhere(userId, walletId),
    orderBy: { updatedAt: "desc" },
  });

  let healed = 0;
  let outcomesSet = 0;

  for (const order of orders) {
    if (isManualFulfillmentOrder(order)) {
      continue;
    }
    try {
      const forceRefresh =
        order.status === PurchaseOrderStatus.failed &&
        order.paymentChainFinal &&
        order.paymentChainOutcome === "failed" &&
        orderHasPaymentAttempt(order);
      const resolution = await refreshOrderPaymentChainState(order, {
        forceRefresh,
      });
      outcomesSet += 1;

      if (
        resolution.outcome === "success" &&
        order.status !== PurchaseOrderStatus.completed
      ) {
        const fresh = await prisma.purchaseOrder.findUnique({
          where: { id: order.id },
        });
        if (fresh && (await healPurchaseOrderFromChainTruth(fresh))) {
          healed += 1;
        }
      } else if (
        resolution.outcome === "failed" &&
        order.status === PurchaseOrderStatus.failed
      ) {
        await persistOrderPaymentChainState(
          order.id,
          resolution,
          PurchaseOrderStatus.failed
        );
      }
    } catch (error) {
      console.error(
        "[fundReconcile] active order failed",
        order.id,
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    healed,
    outcomesSet,
    deletedFailedInv: 0,
    ordersProcessed: orders.length,
  };
}

/** Reconcile all fund payment tx ids for a wallet against chain before materializing activity. */
export async function reconcileWalletFundPayments(
  userId: string,
  walletId: string
): Promise<WalletFundReconcileResult> {
  const orders = await prisma.purchaseOrder.findMany({
    where: { userId, walletId },
    orderBy: { updatedAt: "desc" },
  });

  let healed = 0;
  let outcomesSet = 0;

  for (const order of orders) {
    if (isManualFulfillmentOrder(order)) {
      continue;
    }

    const txIds = collectPaymentTxIdsFromOrder(order);
    const needsCheck =
      txIds.length > 0 ||
      order.status === PurchaseOrderStatus.failed ||
      order.status === PurchaseOrderStatus.processing ||
      !order.paymentChainFinal;

    if (!needsCheck) {
      continue;
    }

    try {
      const resolution = await refreshOrderPaymentChainState(order);
      outcomesSet += 1;

      if (
        resolution.outcome === "success" &&
        order.status !== PurchaseOrderStatus.completed
      ) {
        const fresh = await prisma.purchaseOrder.findUnique({
          where: { id: order.id },
        });
        if (fresh && (await healPurchaseOrderFromChainTruth(fresh))) {
          healed += 1;
        }
      } else if (
        resolution.outcome === "failed" &&
        order.status === PurchaseOrderStatus.failed
      ) {
        await persistOrderPaymentChainState(
          order.id,
          resolution,
          PurchaseOrderStatus.failed
        );
      }
    } catch (error) {
      console.error(
        "[fundReconcile] order failed",
        order.id,
        error instanceof Error ? error.message : error
      );
    }
  }

  const failedOrders = await prisma.purchaseOrder.findMany({
    where: { userId, walletId, status: PurchaseOrderStatus.failed },
  });
  const failedInvestments = await prisma.failedInvestment.findMany({
    where: { userId, walletId },
  });

  let deletedFailedInv = 0;
  for (const item of failedInvestments) {
    if (await tryDeleteRedundantFailedInvestment(item, failedOrders)) {
      deletedFailedInv += 1;
    }
  }

  return {
    healed,
    outcomesSet,
    deletedFailedInv,
    ordersProcessed: orders.length,
  };
}

/** Global cron pass for misclassified failed orders and orphan failed investments. */
export async function reconcileFalseFailedRecords(): Promise<{
  healed: number;
  deletedFailedInv: number;
  outcomesSet: number;
}> {
  const cap = PURCHASE_ORDER_RECONCILE_MAX_PER_RUN;

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      ...automaticFulfillmentOrderFilter(),
      status: PurchaseOrderStatus.failed,
      OR: [
        { paymentChainFinal: false },
        { paymentChainOutcome: null },
        { paymentChainOutcome: "success" },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: cap,
  });

  let healed = 0;
  let outcomesSet = 0;

  for (const order of orders) {
    if (isManualFulfillmentOrder(order)) {
      continue;
    }
    try {
      const resolution = await refreshOrderPaymentChainState(order);
      outcomesSet += 1;
      if (resolution.outcome === "success") {
        const fresh = await prisma.purchaseOrder.findUnique({
          where: { id: order.id },
        });
        if (fresh && (await healPurchaseOrderFromChainTruth(fresh))) {
          healed += 1;
        }
      } else if (resolution.outcome === "failed") {
        await persistOrderPaymentChainState(
          order.id,
          resolution,
          PurchaseOrderStatus.failed
        );
      }
    } catch (error) {
      console.error(
        "[fundReconcile] global order failed",
        order.id,
        error instanceof Error ? error.message : error
      );
    }
  }

  const { deleted } = await cleanupRedundantFailedInvestments({
    limit: getEnv().failedInvestmentCleanupLimit,
  });

  return { healed, deletedFailedInv: deleted, outcomesSet };
}
