"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { syncAdminOnChainHistory } from "@/services/admin/historySync";

export async function triggerTreasuryHistorySync() {
  return withAdminAction(async () => {
    const result = await syncAdminOnChainHistory();
    revalidatePath("/admin/treasury");
    revalidatePath("/admin/dashboard");
    return result;
  });
}
