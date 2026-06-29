import {
  InvestmentStatus,
  UnpaidMaturityResolution,
  type Investment,
} from "@prisma/client";
import {
  hasActiveUnpaidMaturityChoiceWindow,
} from "@/lib/config/unpaidMaturityChoice";

export type NormalPayoutExclusionFields = Pick<
  Investment,
  | "unpaidMaturityResolution"
  | "status"
  | "referralRecoveryCompletedAt"
  | "unpaidMaturityChoiceDeadlineAt"
>;

/** @deprecated Use NormalPayoutExclusionFields */
export type ReferralRecoveryNormalPayoutFields = NormalPayoutExclusionFields;

export type NormalPayoutExclusionReason =
  | "unpaid_maturity_choice_pending"
  | "referral_recovery_path";

function isExcludedOnReferralRecoveryPath(
  investment: Pick<
    Investment,
    "unpaidMaturityResolution" | "status" | "referralRecoveryCompletedAt"
  >
): boolean {
  if (
    investment.unpaidMaturityResolution !==
    UnpaidMaturityResolution.referral_recovery
  ) {
    return false;
  }

  if (investment.referralRecoveryCompletedAt) return false;
  if (investment.status === InvestmentStatus.referral_recovered) return false;
  if (investment.status === InvestmentStatus.redeemed) return false;
  if (investment.status === InvestmentStatus.forfeited) return false;

  return true;
}

export function normalPayoutExclusionReason(
  investment: NormalPayoutExclusionFields,
  now: Date = new Date()
): NormalPayoutExclusionReason | null {
  if (hasActiveUnpaidMaturityChoiceWindow(investment, now)) {
    return "unpaid_maturity_choice_pending";
  }
  if (isExcludedOnReferralRecoveryPath(investment)) {
    return "referral_recovery_path";
  }
  return null;
}

/**
 * Investments blocked from triad unlock, surplus FIFO, and admin Pay now.
 * Active unpaid-maturity choice window, or referral-recovery path until principal is recovered.
 */
export function isExcludedFromNormalPayout(
  investment: NormalPayoutExclusionFields,
  now: Date = new Date()
): boolean {
  return normalPayoutExclusionReason(investment, now) != null;
}
