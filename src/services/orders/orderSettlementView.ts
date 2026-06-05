import {
  InvestmentStatus,
  PurchaseOrderStatus,
  PurchaseOrderStep,
  type PurchaseOrder,
} from "@prisma/client";
import { isManualFulfillmentOrder } from "@/services/orders/purchaseOrderManual";
import { settlementTraceLog } from "@/lib/settlementTraceLog";
import { refreshOrderPaymentChainState } from "@/services/wallets/paymentChainState";
import type { OrderPaymentOutcome } from "@/services/tron/usdtPaymentChainTruth";
import { collectPaymentTxIdsFromOrder } from "@/services/tron/usdtPaymentChainTruth";

export type OrderSettlementPhase =
  | "reserved"
  | "fueling"
  | "paying"
  | "confirming"
  | "succeeded"
  | "failed";

export type OrderDisplayStatus = "pending" | "confirmed" | "failed";

export type OrderSettlementView = {
  phase: OrderSettlementPhase;
  paymentChainOutcome: OrderPaymentOutcome | null;
  displayStatus: OrderDisplayStatus;
  settlementLabel: string;
  failureReason?: string;
};

const FUEL_STEPS: PurchaseOrderStep[] = [
  PurchaseOrderStep.trx_topup,
  PurchaseOrderStep.trx_confirm,
];

export function orderHasPaymentAttempt(order: PurchaseOrder): boolean {
  return (
    Boolean(order.usdtTxId) || (order.failedUsdtTxIds?.length ?? 0) > 0
  );
}

const MANUAL_REVIEW_STEPS: PurchaseOrderStep[] = [
  PurchaseOrderStep.awaiting_trx,
  PurchaseOrderStep.awaiting_usdt,
  PurchaseOrderStep.awaiting_review,
];

export function deriveOrderSettlementPhaseFromDb(
  order: PurchaseOrder,
  chainOutcome: OrderPaymentOutcome | null = order.paymentChainOutcome as OrderPaymentOutcome | null
): OrderSettlementPhase {
  if (order.status === PurchaseOrderStatus.completed) {
    return "succeeded";
  }

  if (isManualFulfillmentOrder(order)) {
    if (order.status === PurchaseOrderStatus.failed) {
      return "failed";
    }
    switch (order.step) {
      case PurchaseOrderStep.awaiting_trx:
        return "reserved";
      case PurchaseOrderStep.awaiting_usdt:
        return "paying";
      case PurchaseOrderStep.awaiting_review:
        return "confirming";
      default:
        if (MANUAL_REVIEW_STEPS.includes(order.step)) {
          return "confirming";
        }
        return "reserved";
    }
  }

  if (order.status === PurchaseOrderStatus.failed) {
    if (chainOutcome === "success") {
      return "confirming";
    }
    if (chainOutcome === "pending" || chainOutcome === "unknown") {
      return "confirming";
    }
    return "failed";
  }

  if (FUEL_STEPS.includes(order.step)) {
    return "fueling";
  }

  if (order.step === PurchaseOrderStep.usdt_transfer && !order.usdtTxId) {
    return "paying";
  }

  if (
    order.step === PurchaseOrderStep.usdt_confirm ||
    order.usdtTxId ||
    orderHasPaymentAttempt(order)
  ) {
    return "confirming";
  }

  return "reserved";
}

export function settlementPhaseToDisplayStatus(
  phase: OrderSettlementPhase,
  chainOutcome: OrderPaymentOutcome | null
): OrderDisplayStatus {
  if (phase === "succeeded") {
    return "confirmed";
  }
  if (phase === "failed") {
    return "failed";
  }
  if (phase === "confirming" && chainOutcome === "failed") {
    return "failed";
  }
  return "pending";
}

export const RETRY_PENDING_PREFIX = "retry_pending:";

export function settlementLabelForOrder(
  order: PurchaseOrder,
  phase: OrderSettlementPhase
): string {
  if (phase === "failed") {
    return "Failed";
  }
  if (isManualFulfillmentOrder(order)) {
    switch (order.step) {
      case PurchaseOrderStep.awaiting_trx:
        return "Submitted";
      case PurchaseOrderStep.awaiting_usdt:
        return "Preparing payment";
      case PurchaseOrderStep.awaiting_review:
        return "Under review";
      default:
        return "Processing";
    }
  }
  if (phase === "reserved" || phase === "fueling") {
    if ((order.failureReason || "").startsWith(RETRY_PENDING_PREFIX)) {
      return "Retrying";
    }
    return "Preparing";
  }
  return settlementPhaseLabel(phase);
}

export function buildOrderSettlementView(
  order: PurchaseOrder,
  chainOutcome: OrderPaymentOutcome | null = order.paymentChainOutcome as OrderPaymentOutcome | null
): OrderSettlementView {
  const phase = deriveOrderSettlementPhaseFromDb(order, chainOutcome);
  const displayStatus = settlementPhaseToDisplayStatus(phase, chainOutcome);
  return {
    phase,
    paymentChainOutcome: chainOutcome,
    displayStatus,
    settlementLabel: settlementLabelForOrder(order, phase),
    ...(order.failureReason && displayStatus === "failed"
      ? { failureReason: order.failureReason }
      : {}),
  };
}

type LinkedInvestmentForDisplay = {
  status: string;
} | null;

/** Activity display status — confirmed only when investment is activated or order completed. */
export function resolvePurchaseOrderActivityDisplayStatus(
  order: PurchaseOrder,
  settlement: OrderSettlementView,
  linkedInvestment: LinkedInvestmentForDisplay = null
): OrderDisplayStatus {
  if (settlement.displayStatus === "failed") {
    return "failed";
  }

  if (isManualFulfillmentOrder(order)) {
    if (order.status === PurchaseOrderStatus.completed) {
      return "confirmed";
    }
    if (order.status === PurchaseOrderStatus.failed) {
      return "failed";
    }
    return "pending";
  }

  if (order.status === PurchaseOrderStatus.completed) {
    return "confirmed";
  }

  const investmentActivated =
    linkedInvestment != null &&
    linkedInvestment.status !== InvestmentStatus.pending &&
    linkedInvestment.status !== InvestmentStatus.failed;

  if (investmentActivated) {
    return "confirmed";
  }

  if (
    order.paymentChainOutcome === "success" ||
    settlement.phase === "confirming" ||
    settlement.phase === "succeeded"
  ) {
    return "pending";
  }

  return settlement.displayStatus;
}

export async function deriveOrderSettlement(
  order: PurchaseOrder,
  { refreshChain = false }: { refreshChain?: boolean } = {}
): Promise<OrderSettlementView> {
  let chainOutcome = order.paymentChainOutcome as OrderPaymentOutcome | null;

  if (refreshChain && !order.paymentChainFinal && orderHasPaymentAttempt(order)) {
    const resolution = await refreshOrderPaymentChainState(order);
    chainOutcome = resolution.outcome;
  }

  const view = buildOrderSettlementView(order, chainOutcome);

  settlementTraceLog("deriveOrderSettlement", {
    orderId: order.id,
    step: order.step,
    dbStatus: order.status,
    paymentChainOutcome: order.paymentChainOutcome,
    chainOutcome,
    phase: view.phase,
    displayStatus: view.displayStatus,
  });

  return view;
}

export type FailGateResult =
  | { action: "proceed"; resolution?: never }
  | { action: "heal"; resolution: { winningTxId: string } }
  | { action: "wait"; resolution: { outcome: OrderPaymentOutcome } };

/** Gate terminal failure when a USDT payment may exist on chain. */
export async function gateOrderBeforeFail(
  order: PurchaseOrder
): Promise<FailGateResult> {
  if (!orderHasPaymentAttempt(order)) {
    return { action: "proceed" };
  }

  const resolution = await refreshOrderPaymentChainState(order);

  settlementTraceLog("gateOrderBeforeFail", {
    orderId: order.id,
    step: order.step,
    dbStatus: order.status,
    outcome: resolution.outcome,
    winningTxId: resolution.winningTxId ?? null,
  });

  if (resolution.outcome === "success" && resolution.winningTxId) {
    return { action: "heal", resolution: { winningTxId: resolution.winningTxId } };
  }

  if (resolution.outcome === "pending" || resolution.outcome === "unknown") {
    return { action: "wait", resolution: { outcome: resolution.outcome } };
  }

  return { action: "proceed" };
}

export function settlementPhaseLabel(phase: OrderSettlementPhase): string {
  switch (phase) {
    case "reserved":
      return "Preparing";
    case "fueling":
      return "Preparing";
    case "paying":
      return "Sending payment";
    case "confirming":
      return "Confirming on network";
    case "succeeded":
      return "Active investment";
    case "failed":
      return "Failed";
    default:
      return "Processing";
  }
}

export function orderIdsWithOpenSettlement(orders: PurchaseOrder[]): string[] {
  return orders
    .filter((order) => {
      if (order.status === PurchaseOrderStatus.completed) {
        return false;
      }
      if (
        order.status === PurchaseOrderStatus.processing ||
        order.status === PurchaseOrderStatus.queued
      ) {
        return true;
      }
      if (order.status === PurchaseOrderStatus.failed && !order.paymentChainFinal) {
        return true;
      }
      return collectPaymentTxIdsFromOrder(order).length > 0 && !order.paymentChainFinal;
    })
    .map((order) => order.id);
}
