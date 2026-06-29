import type { Investment } from "@prisma/client";
import { isUnpaidMaturityChoicePending } from "@/services/investments/unpaidMaturityChoice";

export type MaturityEmailScenario =
  | "payout_eligible"
  | "choice_required"
  | "waiting";

export type MaturityEmailScenarioInput = Pick<
  Investment,
  | "id"
  | "status"
  | "payoutUnlockedAt"
  | "unpaidMaturityChoiceDeadlineAt"
  | "unpaidMaturityResolution"
  | "referralRecoveryCompletedAt"
  | "subscribedAt"
  | "projectedPayoutUsdt"
  | "maturesAt"
>;

export function resolveMaturityEmailScenario(
  investment: MaturityEmailScenarioInput,
  fifoEligibleIds: ReadonlySet<string>,
  now: Date = new Date()
): MaturityEmailScenario {
  if (investment.payoutUnlockedAt) {
    return "payout_eligible";
  }

  if (isUnpaidMaturityChoicePending(investment, fifoEligibleIds, now)) {
    return "choice_required";
  }

  if (fifoEligibleIds.has(investment.id)) {
    return "payout_eligible";
  }

  return "waiting";
}
