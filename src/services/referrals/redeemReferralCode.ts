import { hasCompletedFirstInvestment } from "./referralEligibility";
import { ReferralError } from "./referralErrors";
import { savePendingReferralCode } from "./pendingReferralCode";

export async function redeemReferralCodeManual(userId: string, rawCode: string) {
  if (await hasCompletedFirstInvestment(userId)) {
    throw new ReferralError(
      "NOT_ELIGIBLE_TO_REDEEM",
      "Welcome bonuses are only for new users who have not invested yet",
      403
    );
  }

  return savePendingReferralCode(userId, rawCode);
}
