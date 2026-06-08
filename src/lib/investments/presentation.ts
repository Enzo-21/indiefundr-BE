import { InvestmentStatus, type Investment } from "@prisma/client";

/** Legacy rows may have payoutEligibleAt; new rows rely on payabilityStatus. */
export function isPastPayoutEligible(investment: Investment): boolean {
  if (investment.payoutEligibleAt) {
    return Date.now() >= investment.payoutEligibleAt.getTime();
  }
  return investment.status === "matured";
}

export function getUserStatusLabel(investment: Investment): string {
  const status = investment.status;

  if (status === InvestmentStatus.pending) return "Processing";
  if (status === InvestmentStatus.active) return "Active";
  if (status === InvestmentStatus.redeeming) return "Claiming…";
  if (status === InvestmentStatus.redeemed) return "Redeemed";
  if (status === InvestmentStatus.referral_recovered) return "Principal recovered";
  if (status === InvestmentStatus.failed) return "Failed";

  if (status === InvestmentStatus.matured) {
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
