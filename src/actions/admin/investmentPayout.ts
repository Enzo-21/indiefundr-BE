"use server";

import { revalidatePath } from "next/cache";
import { withAdminAction } from "@/actions/_lib/withAdminAction";
import {
  broadcastInvestmentPayoutUsdt,
  getInvestmentPayoutWorkflowSeed,
  prepareInvestmentPayout,
  type InvestmentPayoutMode,
  validateInvestmentPayout,
  markInvestmentAutopilotManualCheck,
} from "@/services/admin/investmentPayoutFulfillment";
import { confirmInvestmentRedemption } from "@/services/investments/redemptions";
import { listAutopilotPayoutCandidates } from "@/services/admin/payoutAutopilot";

function revalidateInvestmentViews() {
  revalidatePath("/admin/investments");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/treasury");
}

export async function adminGetInvestmentPayoutSeed(investmentId: string) {
  return withAdminAction(() => getInvestmentPayoutWorkflowSeed(investmentId));
}

export async function adminGetAutopilotPayoutCandidates(options: {
  includeNormal: boolean;
  includeSurplus: boolean;
}) {
  return withAdminAction(() => listAutopilotPayoutCandidates(options));
}

export async function adminValidateInvestmentPayout(
  investmentId: string,
  mode: InvestmentPayoutMode
) {
  return withAdminAction(() => validateInvestmentPayout(investmentId, mode));
}

export async function adminPrepareInvestmentPayout(
  investmentId: string,
  mode: InvestmentPayoutMode
) {
  return withAdminAction(() => prepareInvestmentPayout(investmentId, mode));
}

export async function adminBroadcastInvestmentPayout(investmentId: string) {
  return withAdminAction(() => broadcastInvestmentPayoutUsdt(investmentId));
}

export async function adminCompleteInvestmentPayout(investmentId: string) {
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

export async function adminMarkInvestmentAutopilotManualCheck(
  investmentId: string,
  error: string
) {
  const result = await withAdminAction(() =>
    markInvestmentAutopilotManualCheck(investmentId, error, "admin")
  );
  if (result.ok) {
    revalidateInvestmentViews();
  }
  return result;
}
