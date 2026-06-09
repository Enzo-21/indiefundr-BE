"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { verifyAdminSession } from "@/lib/auth/adminSession";
import {
  broadcastReferralPayoutUsdt,
  completeReferralPayoutOrder,
  markReferralPayoutOrderFailed,
} from "@/services/admin/referralPayoutOrderFulfillment";

function revalidateOrderViews() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/investments");
}

export async function adminBroadcastReferralPayout(orderId: string) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(async () => {
    const txId = await broadcastReferralPayoutUsdt(orderId, session.email);
    return { txId };
  });
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminCompleteReferralPayout(
  orderId: string,
  usdtTxId?: string
) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(async () => {
    await completeReferralPayoutOrder(orderId, session.email, usdtTxId);
    return { ok: true };
  });
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminMarkReferralPayoutFailed(
  orderId: string,
  reason: string
) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    markReferralPayoutOrderFailed(orderId, reason, session.email)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}
