import type { Investment } from "@prisma/client";
import {
  resolveMaturitySituation,
  type MaturitySituationContext,
  type MaturitySituationView,
} from "@/lib/investments/maturitySituation";

/** Legacy rows may have payoutEligibleAt; new rows rely on payabilityStatus. */
export function isPastPayoutEligible(investment: Investment): boolean {
  if (investment.payoutEligibleAt) {
    return Date.now() >= investment.payoutEligibleAt.getTime();
  }
  return investment.status === "matured";
}

export function resolveInvestmentMaturitySituation(
  investment: Investment,
  context: MaturitySituationContext = {}
): MaturitySituationView {
  return resolveMaturitySituation(investment, context);
}

export function getUserStatusLabel(
  investment: Investment,
  options?: MaturitySituationContext & { needsUnpaidMaturityChoice?: boolean }
): string {
  if (options?.needsUnpaidMaturityChoice !== undefined) {
    const view = resolveMaturitySituation(investment, {
      ...options,
      fifoEligibleIds: options.fifoEligibleIds ?? new Set<string>(),
    });
    if (options.needsUnpaidMaturityChoice && investment.status === "matured") {
      return "Choose next step";
    }
    return view.statusLabel;
  }

  return resolveMaturitySituation(investment, options).statusLabel;
}

export function canUserClaim(_investment: Investment): boolean {
  return false;
}
