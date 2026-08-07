"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { verifyAdminSession } from "@/lib/auth/adminSession";
import {
  broadcastUsdtPurchaseUsdt,
  completeUsdtPurchaseOrder,
  getUsdtPurchaseFulfillmentEstimate,
  markUsdtPurchaseOrderFailed,
  resetUsdtPurchaseUsdtForRetry,
} from "@/services/admin/usdtPurchaseOrderFulfillment";

function revalidateOrderViews() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/dashboard");
}

export async function adminBroadcastUsdtPurchase(orderId: string) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(async () => {
    const txId = await broadcastUsdtPurchaseUsdt(orderId, session.email);
    return { txId };
  });
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminCompleteUsdtPurchase(
  orderId: string,
  usdtTxId?: string
) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(async () => {
    await completeUsdtPurchaseOrder(orderId, session.email, usdtTxId);
    return { ok: true };
  });
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminMarkUsdtPurchaseFailed(
  orderId: string,
  reason: string
) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    markUsdtPurchaseOrderFailed(orderId, reason, session.email)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminGetUsdtPurchaseEstimate(orderId: string) {
  return withAdminAction(() => getUsdtPurchaseFulfillmentEstimate(orderId));
}

export async function adminResetUsdtPurchaseUsdt(orderId: string) {
  const result = await withAdminAction(() =>
    resetUsdtPurchaseUsdtForRetry(orderId)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}
