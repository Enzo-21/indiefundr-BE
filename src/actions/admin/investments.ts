"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { confirmInvestmentRedemption } from "@/services/investments/redemptions";

function revalidateInvestmentViews() {
  revalidatePath("/admin/investments");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/treasury");
}

export async function adminConfirmInvestmentRedemption(investmentId: string) {
  const result = await withAdminAction(async () => {
    const confirm = await confirmInvestmentRedemption(investmentId);
    if (confirm.outcome === "confirmed") {
      return { ok: true as const, confirmed: true };
    }
    if (confirm.outcome === "pending") {
      throw new Error("Payout transaction is still pending on-chain");
    }
    if (confirm.outcome === "failed_reverted") {
      throw new Error(
        "Payout failed on-chain; investment reverted for retry"
      );
    }
    const reason = confirm.reason ?? "unknown";
    throw new Error(`Cannot confirm payout (${reason})`);
  });
  if (result.ok) {
    revalidateInvestmentViews();
  }
  return result;
}
