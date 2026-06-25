import {
  InvestmentStatus,
  UnpaidMaturityResolution,
  type Investment,
} from "@prisma/client";

export type ReferralRecoveryNormalPayoutFields = Pick<
  Investment,
  "unpaidMaturityResolution" | "status" | "referralRecoveryCompletedAt"
>;

/** Matured investments on the referral-recovery path are paid only via principal_recovery (25 USDT), not triad/surplus/FIFO. */
export function isExcludedFromNormalPayout(
  investment: ReferralRecoveryNormalPayoutFields
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
