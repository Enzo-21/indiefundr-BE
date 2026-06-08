import type { Investment } from "@prisma/client";

/** Legacy rows may have payoutEligibleAt; new rows rely on payabilityStatus. */
export function isPastPayoutEligible(investment: Investment): boolean {
  if (investment.payoutEligibleAt) {
    return Date.now() >= investment.payoutEligibleAt.getTime();
  }
  return investment.status === "matured";
}

export function getUserStatusLabel(investment: Investment): string {
  const status = investment.status;

  if (status === "pending") return "Processing";
  if (status === "active") return "Active";
  if (status === "redeeming") return "Claiming…";
  if (status === "redeemed") return "Redeemed";
  if (status === "referral_recovered") return "Principal recovered";
  if (status === "failed") return "Failed";

  if (status === "matured") {
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
