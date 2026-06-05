import { InvestmentStatus, type Investment } from "@prisma/client";
import { isSurplusPayoutTrigger } from "@/services/revenueEngine/payoutScheduler";

export type AdminPayoutStatus =
  | "paid"
  | "paid_surplus"
  | "paying"
  | "paying_surplus"
  | "failed"
  | "ready"
  | "waiting";

type PayoutStatusInput = Pick<
  Investment,
  | "status"
  | "payoutTriggeredBy"
  | "payoutFailureReason"
  | "payoutUnlockedAt"
>;

export function deriveAdminPayoutStatus(
  inv: PayoutStatusInput
): AdminPayoutStatus {
  const surplus = isSurplusPayoutTrigger(inv.payoutTriggeredBy);

  if (inv.status === InvestmentStatus.redeemed) {
    return surplus ? "paid_surplus" : "paid";
  }

  if (inv.status === InvestmentStatus.redeeming) {
    if (inv.payoutFailureReason) {
      return "failed";
    }
    return surplus ? "paying_surplus" : "paying";
  }

  if (inv.payoutFailureReason) {
    return "failed";
  }

  if (inv.payoutUnlockedAt) {
    return "ready";
  }

  return "waiting";
}
