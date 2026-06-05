import { InvestmentStatus } from "@prisma/client";
import type { AdminInvestmentRow } from "@/services/admin/investmentAdminTypes";
import { isSurplusPayoutTrigger } from "@/services/revenueEngine/payoutScheduler";
import { investmentShortId } from "./investmentTableIds";

function formatUnlockedAfterInvestmentIds(investmentIds: string[]): string {
  const labels = investmentIds.map(investmentShortId);
  if (labels.length === 0) {
    return "Unlocked (payable)";
  }
  if (labels.length === 1) {
    return `Unlocked after ${labels[0]}`;
  }
  if (labels.length === 2) {
    return `Unlocked after ${labels[0]} and ${labels[1]}`;
  }
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1).join(", ");
  return `Unlocked after ${rest} and ${last}`;
}

/** Single admin-facing reason line; no surplus eligibility noise or user names. */
export function buildInvestmentReasonNote(inv: AdminInvestmentRow): string | null {
  if (inv.payoutFailureReason) {
    return inv.payoutFailureReason;
  }

  const paidWithSurplus =
    inv.payoutStatus === "paid_surplus" ||
    (inv.status === InvestmentStatus.redeemed &&
      isSurplusPayoutTrigger(inv.payoutTriggeredBy));

  if (paidWithSurplus) {
    return "Paid with surplus";
  }

  if (
    inv.payoutStatus === "paying_surplus" ||
    (inv.status === InvestmentStatus.redeeming &&
      isSurplusPayoutTrigger(inv.payoutTriggeredBy))
  ) {
    return "Paying with surplus";
  }

  const unlockIds = inv.payoutUnlockingInvestmentIds;
  if (inv.payoutUnlockedAt && unlockIds.length > 0) {
    return formatUnlockedAfterInvestmentIds(unlockIds);
  }

  if (inv.payoutUnlockedAt) {
    return "Unlocked (payable)";
  }

  return null;
}
