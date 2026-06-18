import {
  PurchaseOrderStatus,
  PurchaseOrderStep,
  type PurchaseOrder,
} from "@prisma/client";
import { APP_NAME } from "@/lib/constants/appBranding";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import { isManualFulfillmentOrder } from "@/services/orders/purchaseOrderManual";
import {
  RETRY_PENDING_PREFIX,
  type OrderSettlementPhase,
} from "@/services/orders/orderSettlementView";
import type { AppTransaction } from "./walletTransactions";
import type { WalletActivityTx } from "./walletActivityMerge";

export type PendingTapInfo = {
  title: string;
  message: string;
};

export function transactionFromJson(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function getPurchaseOrderActivityLink(order: PurchaseOrder) {
  if (order.usdtTxId) {
    return {
      txId: order.usdtTxId,
      tronscanUrl: getTronscanTxUrl(order.usdtTxId),
    };
  }
  return { txId: null, tronscanUrl: null };
}

export function isManualOrderAwaitingAdminReview(
  order: Pick<PurchaseOrder, "fulfillmentMode" | "step" | "status">
): boolean {
  return (
    isManualFulfillmentOrder(order) &&
    order.step === PurchaseOrderStep.awaiting_review &&
    order.status !== PurchaseOrderStatus.completed &&
    order.status !== PurchaseOrderStatus.failed
  );
}

export function buildPendingOrderSubmittedTapInfo(
  fundName: string
): PendingTapInfo {
  return {
    title: "Order submitted",
    message:
      `Your ${fundName} investment order was created successfully and is being processed. ` +
      "Our team allocates funds to investments within up to 72 business hours. " +
      "Once assigned, your investment is approved right away — you can leave the app and we will notify you when it is active.",
  };
}

export function shouldShowPendingPurchaseOrderTapInfo(
  order: PurchaseOrder,
  displayStatus: string,
  settlementPhase: OrderSettlementPhase
): boolean {
  if (displayStatus !== "pending") {
    return false;
  }
  if (settlementPhase !== "confirming") {
    return true;
  }
  return isManualOrderAwaitingAdminReview(order);
}

export function getPendingPurchaseOrderTapInfo(
  order: PurchaseOrder,
  fundName: string
): PendingTapInfo | null {
  if (isManualOrderAwaitingAdminReview(order)) {
    return buildPendingOrderSubmittedTapInfo(fundName);
  }

  if (order.usdtTxId) {
    return null;
  }

  if (order.topUpTxId || (order.sponsoredTrx && order.sponsoredTrx > 0)) {
    const retryPending = (order.failureReason || "").startsWith(
      RETRY_PENDING_PREFIX
    );
    return {
      title: retryPending ? "Retrying" : "Preparing",
      message: retryPending
        ? `${APP_NAME} is retrying the Tron network fee transfer for your ${fundName} investment after a previous attempt did not succeed. Your USDT is still reserved.`
        : `${APP_NAME} is covering Tron network fees for your ${fundName} investment. ` +
          "This step uses a small TRX transfer on your wallet — it is not your USDT payment. " +
          "Once your USDT is sent, you can tap this activity again for an update.",
    };
  }

  return buildPendingOrderSubmittedTapInfo(fundName);
}

export function getGenericChainActivityLabel(
  type: "in" | "out",
  status: string
): string {
  const normalized = status.toLowerCase();
  if (type === "in") {
    return normalized === "pending" ? "Receiving USDT" : "USDT received";
  }
  return "USDT sent";
}

export function appTransactionToActivityTx(app: AppTransaction): WalletActivityTx {
  return {
    id: app.id,
    type: app.type,
    source: "app",
    amount: app.amount,
    status: app.status,
    label: app.label,
    date: app.date,
    txId: app.txId,
    tronscanUrl: app.tronscanUrl,
    detail: app.detail,
    pendingTapInfo: app.pendingTapInfo,
    displayStatus: app.displayStatus,
    settlementPhase: app.settlementPhase,
    settlementLabel: app.settlementLabel,
    insights: app.insights,
    topUpTxId: app.topUpTxId ?? null,
    topUpTronscanUrl: app.topUpTronscanUrl ?? null,
  };
}
