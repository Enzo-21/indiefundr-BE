"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { verifyAdminSession } from "@/lib/auth/adminSession";
import {
  appendAdminWithdrawalAutopilotManualCheckNote,
  broadcastWithdrawalAdminTrxTopUp,
  broadcastWithdrawalAdminUsdt,
  getWithdrawalFulfillmentEstimate,
  markAdminWithdrawalFailed,
  markAdminWithdrawalSuccess,
  recordWithdrawalAdminTrxTopUp,
  recordWithdrawalAdminUsdtTx,
} from "@/services/admin/withdrawalOrderFulfillment";

function revalidateOrderViews() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/dashboard");
}

export async function adminWithdrawalRecordTrxTopUp(
  orderId: string,
  txId: string
) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    recordWithdrawalAdminTrxTopUp(orderId, txId, session.email)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminWithdrawalRecordUsdtPayment(
  orderId: string,
  txId: string
) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    recordWithdrawalAdminUsdtTx(orderId, txId, session.email)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminWithdrawalGetEstimate(orderId: string) {
  return withAdminAction(() => getWithdrawalFulfillmentEstimate(orderId));
}

export async function adminWithdrawalBroadcastTrxTopUp(orderId: string) {
  const result = await withAdminAction(() =>
    broadcastWithdrawalAdminTrxTopUp(orderId)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminWithdrawalBroadcastUsdt(orderId: string) {
  const result = await withAdminAction(() =>
    broadcastWithdrawalAdminUsdt(orderId)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminWithdrawalMarkSuccess(orderId: string) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    markAdminWithdrawalSuccess(orderId, session.email)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminWithdrawalMarkFailed(
  orderId: string,
  reason: string
) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    markAdminWithdrawalFailed(orderId, reason, session.email)
  );
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}

export async function adminMarkWithdrawalAutopilotManualCheck(
  orderId: string,
  error: string
) {
  const session = await verifyAdminSession();
  const result = await withAdminAction(() =>
    appendAdminWithdrawalAutopilotManualCheckNote(
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
