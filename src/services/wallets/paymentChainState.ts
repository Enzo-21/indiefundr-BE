import {
  PurchaseOrderStatus,
  type PurchaseOrder,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { orderHasPaymentAttempt } from "@/services/orders/orderSettlementView";
import {
  buildFundPaymentContext,
  resolveOrderPaymentOnChain,
  type OrderPaymentOutcome,
  type OrderPaymentResolution,
} from "@/services/tron/usdtPaymentChainTruth";

export function isPaymentChainOutcomeFinal(
  outcome: OrderPaymentOutcome,
  orderStatus: PurchaseOrderStatus
): boolean {
  if (orderStatus === PurchaseOrderStatus.completed) {
    return true;
  }
  if (outcome === "success") {
    return true;
  }
  if (outcome === "failed" && orderStatus === PurchaseOrderStatus.failed) {
    return true;
  }
  return false;
}

export async function persistOrderPaymentChainState(
  orderId: string,
  resolution: OrderPaymentResolution,
  orderStatus: PurchaseOrderStatus
): Promise<void> {
  const outcome = resolution.outcome;
  const paymentChainFinal =
    isPaymentChainOutcomeFinal(outcome, orderStatus) ||
    orderStatus === PurchaseOrderStatus.completed;

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      paymentChainOutcome: outcome,
      paymentChainTxId: resolution.winningTxId ?? undefined,
      paymentChainCheckedAt: new Date(),
      paymentChainFinal,
    },
  });
}

function orderNeedsFalseFinalAudit(order: PurchaseOrder): boolean {
  return (
    order.status === PurchaseOrderStatus.failed &&
    order.paymentChainFinal &&
    order.paymentChainOutcome === "failed" &&
    orderHasPaymentAttempt(order)
  );
}

/** Refresh on-chain payment truth when not yet finalized. */
export async function refreshOrderPaymentChainState(
  order: PurchaseOrder,
  { forceRefresh = false }: { forceRefresh?: boolean } = {}
): Promise<OrderPaymentResolution> {
  const auditFalseFinal = forceRefresh || orderNeedsFalseFinalAudit(order);

  if (
    !auditFalseFinal &&
    order.paymentChainFinal &&
    order.paymentChainOutcome
  ) {
    return {
      outcome: order.paymentChainOutcome as OrderPaymentOutcome,
      winningTxId: order.paymentChainTxId ?? undefined,
    };
  }

  const treasury = getEnv().treasuryAddress;
  const resolution = await resolveOrderPaymentOnChain(
    order,
    treasury ? buildFundPaymentContext(order, treasury) : undefined
  );
  await persistOrderPaymentChainState(order.id, resolution, order.status);
  return resolution;
}
