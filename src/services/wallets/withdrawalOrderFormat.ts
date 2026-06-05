import type { WithdrawalOrder } from "@prisma/client";
import { buildWithdrawalOrderSettlementView } from "@/services/orders/withdrawalOrderSettlementView";

export function formatWithdrawalOrderResponse(order: WithdrawalOrder) {
  const settlement = buildWithdrawalOrderSettlementView(order);
  return {
    orderId: order.id,
    status: order.status,
    step: order.step,
    amountUsdt: order.amountUsdt,
    reservedUsdt: order.reservedUsdt,
    destinationAddress: order.destinationAddress,
    topUpTxId: order.adminTrxTopUpTxId,
    usdtTxId: order.usdtTxId ?? order.adminUsdtTxId,
    failureReason: order.failureReason,
    date: order.date.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    settlementPhase: settlement.phase,
    displayStatus: settlement.displayStatus,
    settlementLabel: settlement.settlementLabel,
    paymentChainOutcome: order.paymentChainOutcome,
    paymentChainFinal: order.paymentChainFinal,
    activityId: `withdrawal-order-${order.id}`,
  };
}
