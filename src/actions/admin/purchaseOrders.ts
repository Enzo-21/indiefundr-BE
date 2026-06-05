"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { verifyAdminSession } from "@/lib/auth/adminSession";
import {
  broadcastAdminTrxTopUp,
  broadcastAdminUsdtPayment,
  getAdminFulfillmentEstimate,
  getAdminOrderWalletSnapshot,
  getAdminTransactionStatus,
  listAdminOrderQueue,
  markAdminPurchaseOrderFailed,
  markAdminPurchaseOrderSuccess,
  recoverAdminSponsoredTrx,
  recordAdminTrxAfterUsdt,
  recordAdminTrxTopUpTx,
  recordAdminUsdtTx,
  resetAdminUsdtForFuelRetry,
  updateAdminPurchaseOrderNotes,
  appendAdminOrderAutopilotManualCheckNote,
} from "@/services/admin/purchaseOrderFulfillment";
import { listAutopilotOrderCandidates } from "@/services/admin/orderAutopilot";
import { getSiblingOpenOrdersForPurchaseOrder } from "@/services/admin/siblingOpenOrders";

function revalidateOrderViews() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/investments");
}

function logCompleteOrderAction(
  action: string,
  orderId: string,
  extra: Record<string, unknown> = {}
): void {
  console.log("[admin-complete-order]", { action, orderId, ...extra });
}

export async function fetchAdminOrders() {
  return withAdminAction(() => listAdminOrderQueue());
}

export async function adminGetAutopilotOrderCandidates(options?: {
  includeInvestment?: boolean;
  includeWithdrawal?: boolean;
}) {
  return withAdminAction(() => listAutopilotOrderCandidates(options ?? {}));
}

export async function adminGetSiblingOpenOrdersForRecovery(
  purchaseOrderId: string
) {
  return withAdminAction(() =>
    getSiblingOpenOrdersForPurchaseOrder(purchaseOrderId)
  );
}

/** @deprecated Use fetchAdminOrders */
export const fetchAdminSubscriptions = fetchAdminOrders;

export async function adminRecordTrxTopUp(orderId: string, txId: string) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    recordAdminTrxTopUpTx(orderId, txId, session.email)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminRecordUsdtPayment(orderId: string, txId: string) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    recordAdminUsdtTx(orderId, txId, session.email)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminGetFulfillmentEstimate(orderId: string) {
  logCompleteOrderAction("adminGetFulfillmentEstimate", orderId);
  return withAdminAction(() => getAdminFulfillmentEstimate(orderId));
}

export async function adminGetOrderWalletSnapshot(orderId: string) {
  logCompleteOrderAction("adminGetOrderWalletSnapshot", orderId);
  return withAdminAction(() => getAdminOrderWalletSnapshot(orderId));
}

export async function adminRecordTrxAfterUsdt(orderId: string) {
  logCompleteOrderAction("adminRecordTrxAfterUsdt", orderId);
  const result = await withAdminAction(() => recordAdminTrxAfterUsdt(orderId));
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminBroadcastTrxTopUp(
  orderId: string,
  minEstimatedTrx?: number
) {
  logCompleteOrderAction("adminBroadcastTrxTopUp", orderId, { minEstimatedTrx });
  const result = await withAdminAction(() =>
    broadcastAdminTrxTopUp(orderId, { minEstimatedTrx })
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminGetTransactionStatus(
  txId: string,
  expectUsdtTransfer = false
) {
  return withAdminAction(() =>
    getAdminTransactionStatus(txId, { expectUsdtTransfer })
  );
}

export async function adminResetUsdtForFuelRetry(
  orderId: string,
  observedFeeTrx?: number
) {
  const result = await withAdminAction(() =>
    resetAdminUsdtForFuelRetry(orderId, { observedFeeTrx })
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminRecoverSponsoredTrx(orderId: string) {
  logCompleteOrderAction("adminRecoverSponsoredTrx", orderId);
  const result = await withAdminAction(() => recoverAdminSponsoredTrx(orderId));
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminBroadcastUsdtPayment(orderId: string) {
  logCompleteOrderAction("adminBroadcastUsdtPayment", orderId);
  const result = await withAdminAction(async () => {
    const txId = await broadcastAdminUsdtPayment(orderId);
    return { txId };
  });
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminMarkOrderSuccess(orderId: string) {
  logCompleteOrderAction("adminMarkOrderSuccess", orderId);
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    markAdminPurchaseOrderSuccess(orderId, session.email)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

/** @deprecated Use adminMarkOrderSuccess */
export const adminMarkSubscriptionSuccess = adminMarkOrderSuccess;

export async function adminMarkOrderFailed(
  orderId: string,
  reason: string
) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    markAdminPurchaseOrderFailed(orderId, reason, session.email)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

/** @deprecated Use adminMarkOrderFailed */
export const adminMarkSubscriptionFailed = adminMarkOrderFailed;

export async function adminUpdateOrderNotes(
  orderId: string,
  notes: string
) {
  const result = await withAdminAction(() =>
    updateAdminPurchaseOrderNotes(orderId, notes)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

/** @deprecated Use adminUpdateOrderNotes */
export const adminUpdateSubscriptionNotes = adminUpdateOrderNotes;

export async function adminMarkOrderAutopilotManualCheck(
  orderId: string,
  error: string
) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    appendAdminOrderAutopilotManualCheckNote(
      orderId,
      error,
      session.email
    )
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}
