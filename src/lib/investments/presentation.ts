import {
  ForfeitureReason,
  InvestmentStatus,
  UnpaidMaturityResolution,
  type Investment,
} from "@prisma/client";

/** Legacy rows may have payoutEligibleAt; new rows rely on payabilityStatus. */
export function isPastPayoutEligible(investment: Investment): boolean {
  if (investment.payoutEligibleAt) {
    return Date.now() >= investment.payoutEligibleAt.getTime();
  }
  return investment.status === "matured";
}

export function getUserStatusLabel(
  investment: Investment,
  options?: { needsUnpaidMaturityChoice?: boolean }
): string {
  const status = investment.status;

  if (status === InvestmentStatus.pending) return "Processing";
  if (status === InvestmentStatus.active) {
    if (
      investment.unpaidMaturityResolution ===
      UnpaidMaturityResolution.term_extension
    ) {
      return "Extended — active";
    }
    return "Active";
  }
  if (status === InvestmentStatus.redeeming) return "Claiming…";
  if (status === InvestmentStatus.redeemed) return "Redeemed";
  if (status === InvestmentStatus.referral_recovered) return "Principal recovered";
  if (status === InvestmentStatus.forfeited) {
    if (investment.forfeitureReason === ForfeitureReason.choice_deadline_expired) {
      return "Term ended — no choice made";
    }
    if (investment.forfeitureReason === ForfeitureReason.second_maturity_unpaid) {
      return "Term ended — fund unpaid";
    }
    if (investment.forfeitureReason === ForfeitureReason.recovery_window_expired) {
      return "Recovery window ended";
    }
    return "Investment forfeited";
  }
  if (status === InvestmentStatus.failed) return "Failed";

  if (status === InvestmentStatus.matured) {
    if (options?.needsUnpaidMaturityChoice) {
      return "Choose next step";
    }
    if (investment.recoveryEligibleAt) {
      return "Recover via invites";
    }
    if (investment.payabilityStatus === "payable") {
      return "Awaiting admin payout";
    }
    return "Payout pending";
  }

  return status;
}

export function canUserClaim(_investment: Investment): boolean {
  return false;
}
