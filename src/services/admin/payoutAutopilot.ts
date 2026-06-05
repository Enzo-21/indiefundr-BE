import { listAdminInvestments } from "@/services/admin/dashboard";
import type { AdminInvestmentRow } from "@/services/admin/investmentAdminTypes";
import type { InvestmentPayoutMode } from "@/services/admin/investmentPayoutFulfillment";

export type AutopilotPayoutCandidate = {
  investmentId: string;
  userEmail: string;
  projectedPayoutUsdt: number;
  mode: InvestmentPayoutMode;
  subscribedAtIso: string | null;
};

export function buildAutopilotPayoutCandidatesFromRows(
  rows: AdminInvestmentRow[],
  options: {
    includeNormal: boolean;
    includeSurplus: boolean;
  }
): AutopilotPayoutCandidate[] {
  const candidates: AutopilotPayoutCandidate[] = [];

  if (options.includeNormal) {
    for (const row of rows) {
      if (row.canPayNow && row.showPayoutActions) {
        candidates.push({
          investmentId: row.id,
          userEmail: row.userEmail,
          projectedPayoutUsdt: row.projectedPayoutUsdt,
          mode: "normal",
          subscribedAtIso: row.subscribedAtIso,
        });
      }
    }
  }

  if (options.includeSurplus) {
    for (const row of rows) {
      if (row.canPayWithSurplus) {
        candidates.push({
          investmentId: row.id,
          userEmail: row.userEmail,
          projectedPayoutUsdt: row.projectedPayoutUsdt,
          mode: "surplus",
          subscribedAtIso: row.subscribedAtIso,
        });
      }
    }
  }

  return candidates;
}

export async function listAutopilotPayoutCandidates(options: {
  includeNormal: boolean;
  includeSurplus: boolean;
}): Promise<AutopilotPayoutCandidate[]> {
  const { rows } = await listAdminInvestments();
  return buildAutopilotPayoutCandidatesFromRows(rows, options);
}
