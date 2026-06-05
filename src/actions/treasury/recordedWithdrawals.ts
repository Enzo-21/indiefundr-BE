"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { listAdminAppRevenueWithdrawals } from "@/services/admin/treasury";

export async function listRecordedAppWithdrawals() {
  return withAdminAction(async () => listAdminAppRevenueWithdrawals());
}
