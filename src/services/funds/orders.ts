import type { PurchaseOrder } from "@prisma/client";
import {
  buildOrderSettlementView,
} from "@/services/orders/orderSettlementView";
import { orderToFundInvestmentShape } from "@/services/wallets/fundInvestmentActivity";

export function formatOrderResponse(order: PurchaseOrder) {
  const settlement = buildOrderSettlementView(order);
  const fundInvestment = orderToFundInvestmentShape(order, settlement);
  return {
    orderId: order.id,
    status: order.status,
    step: order.step,
    fundId: order.fundId,
    costUsdt: order.costUsdt,
    reservedUsdt: order.reservedUsdt,
    topUpTxId: order.topUpTxId,
    usdtTxId: order.usdtTxId,
    investmentId: order.investmentId,
    failureReason: order.failureReason,
    date: order.date.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    settlementPhase: settlement.phase,
    displayStatus: settlement.displayStatus,
    settlementLabel: settlement.settlementLabel,
    paymentChainOutcome: order.paymentChainOutcome,
    paymentChainFinal: order.paymentChainFinal,
    activityId: fundInvestment.activityId,
    fundInvestment,
    fulfillmentMode: order.fulfillmentMode,
  };
}
