import { unlockPrincipalRequired } from "@/lib/config/investmentCohort";
import type { AdminInvestmentRow } from "@/services/admin/investmentAdminTypes";
import type { MaturitySituationView } from "@/lib/investments/maturitySituation";
import { isSurplusPayoutTrigger } from "@/services/revenueEngine/payoutTriggers";
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

function formatAdminDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatAdminUserPathLabel(
  maturity: Pick<MaturitySituationView, "situation" | "chosenPath">
): string {
  switch (maturity.situation) {
    case "choice_required":
      return "Choice open";
    case "extended_active":
      return "Extended wait";
    case "recovery_in_progress":
      return "Invite recovery";
    case "forfeited":
      return "Forfeited";
    default:
      return "None";
  }
}

/** Single admin-facing reason line; no surplus eligibility noise or user names. */
export function buildInvestmentReasonNote(inv: AdminInvestmentRow): string | null {
  if (inv.payoutFailureReason) {
    return inv.payoutFailureReason;
  }

  if (inv.maturitySituation === "choice_required" && inv.unpaidMaturityChoiceDeadlineAt) {
    return `48h choice open — deadline ${formatAdminDate(inv.unpaidMaturityChoiceDeadlineAt)}`;
  }

  if (
    inv.unpaidMaturityResolution === "term_extension" &&
    inv.status === "active"
  ) {
    const days =
      inv.termExtensionDays != null ? ` (+${inv.termExtensionDays}d)` : "";
    return `User chose wait — matures ${formatAdminDate(inv.maturesAt)}${days}`;
  }

  if (inv.unpaidMaturityResolution === "referral_recovery") {
    const qualified = inv.recoveryQualifiedCount ?? 0;
    const required = inv.recoveryRequiredCount ?? 2;
    return `User chose invites — ${qualified}/${required}`;
  }

  if (inv.statusDetail && inv.maturitySituation === "waiting_liquidity") {
    return inv.statusDetail;
  }

  const paidWithSurplus =
    inv.payoutStatus === "paid_surplus" ||
    (inv.status === "redeemed" &&
      isSurplusPayoutTrigger(inv.payoutTriggeredBy));

  if (paidWithSurplus) {
    return "Paid with surplus";
  }

  if (
    inv.payoutStatus === "paying_surplus" ||
    (inv.status === "redeeming" &&
      isSurplusPayoutTrigger(inv.payoutTriggeredBy))
  ) {
    return "Paying with surplus";
  }

  const unlockIds = inv.payoutUnlockingInvestmentIds;
  if (inv.payoutUnlockedAt && inv.payoutReason) {
    return inv.payoutReason;
  }
  if (inv.payoutUnlockedAt && unlockIds.length > 0) {
    return formatUnlockedAfterInvestmentIds(unlockIds);
  }

  if (inv.payoutUnlockedAt) {
    return "Unlocked (payable)";
  }

  if (inv.maturitySituation === "waiting_unlock") {
    const required = unlockPrincipalRequired(inv.amountUsdt);
    return (
      inv.statusDetail ||
      `Waiting for newer investors totaling ${required} USDT (2× your ${inv.amountUsdt} USDT cohort)`
    );
  }

  return null;
}
