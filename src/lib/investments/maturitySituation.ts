import {
  ForfeitureReason,
  InvestmentStatus,
  UnpaidMaturityResolution,
  type Investment,
} from "@prisma/client";
import { isChoiceDeadlineActive } from "@/lib/config/unpaidMaturityChoice";
import { recoveryExpiresAt } from "@/lib/config/referralRecovery";
import { isUnpaidMaturityChoicePending } from "@/services/investments/unpaidMaturityChoice";

export type MaturitySituation =
  | "pending"
  | "active"
  | "extended_active"
  | "choice_required"
  | "waiting_unlock"
  | "waiting_liquidity"
  | "recovery_in_progress"
  | "awaiting_admin_payout"
  | "redeeming"
  | "redeemed"
  | "referral_recovered"
  | "forfeited"
  | "failed"
  | "other";

export type MaturityChosenPath = "term_extension" | "referral_recovery";

export type MaturitySituationInput = Pick<
  Investment,
  | "status"
  | "payabilityStatus"
  | "payoutUnlockedAt"
  | "payoutReason"
  | "recoveryEligibleAt"
  | "referralRecoveryCompletedAt"
  | "unpaidMaturityResolution"
  | "unpaidMaturityChoiceDeadlineAt"
  | "termExtensionDays"
  | "maturesAt"
  | "globalQueueRank"
  | "newSubscribersNeeded"
  | "forfeitureReason"
  | "forfeitedAt"
  | "id"
  | "amountUsdt"
  | "projectedPayoutUsdt"
  | "subscribedAt"
>;

export type MaturitySituationContext = {
  fifoEligibleIds?: ReadonlySet<string>;
  recoveryQualifiedCount?: number | null;
  recoveryRequiredCount?: number | null;
  now?: Date;
};

export type MaturitySituationView = {
  situation: MaturitySituation;
  statusLabel: string;
  statusDetail: string;
  chosenPath: MaturityChosenPath | null;
  nextDeadlineAt: string | null;
  nextDeadlineLabel: string | null;
  globalQueueRank: number | null;
  newSubscribersNeeded: number | null;
  termExtensionDays: number | null;
  unpaidMaturityChoiceDeadlineAt: string | null;
  needsUnpaidMaturityChoice: boolean;
};

function iso(date: Date | null | undefined): string | null {
  return date?.toISOString() ?? null;
}

function needsChoice(
  investment: MaturitySituationInput,
  fifoEligibleIds: ReadonlySet<string>,
  now: Date
): boolean {
  return isUnpaidMaturityChoicePending(investment, fifoEligibleIds, now);
}

function forfeitureLabel(reason: ForfeitureReason | null): string {
  if (reason === ForfeitureReason.choice_deadline_expired) {
    return "Term ended — no choice made";
  }
  if (reason === ForfeitureReason.second_maturity_unpaid) {
    return "Term ended — fund unpaid";
  }
  if (reason === ForfeitureReason.recovery_window_expired) {
    return "Recovery window ended";
  }
  return "Investment forfeited";
}

function forfeitureDetail(reason: ForfeitureReason | null): string {
  if (reason === ForfeitureReason.choice_deadline_expired) {
    return "The 48-hour choice window expired without selecting wait or invite recovery.";
  }
  if (reason === ForfeitureReason.second_maturity_unpaid) {
    return "The extended term ended and payout was still unavailable.";
  }
  if (reason === ForfeitureReason.recovery_window_expired) {
    return "The invite recovery window ended before two friends completed investments.";
  }
  return "This investment was forfeited.";
}

export function resolveMaturitySituation(
  investment: MaturitySituationInput,
  context: MaturitySituationContext = {}
): MaturitySituationView {
  const now = context.now ?? new Date();
  const fifoEligibleIds = context.fifoEligibleIds ?? new Set<string>();
  const choicePending = needsChoice(investment, fifoEligibleIds, now);
  const choiceDeadlineIso = iso(investment.unpaidMaturityChoiceDeadlineAt);

  const base: MaturitySituationView = {
    situation: "other",
    statusLabel: investment.status,
    statusDetail: "",
    chosenPath: null,
    nextDeadlineAt: null,
    nextDeadlineLabel: null,
    globalQueueRank: investment.globalQueueRank ?? null,
    newSubscribersNeeded: investment.newSubscribersNeeded ?? null,
    termExtensionDays: investment.termExtensionDays ?? null,
    unpaidMaturityChoiceDeadlineAt: choiceDeadlineIso,
    needsUnpaidMaturityChoice: choicePending,
  };

  const status = investment.status;

  if (status === InvestmentStatus.pending) {
    return {
      ...base,
      situation: "pending",
      statusLabel: "Processing",
      statusDetail: "Your investment order is being processed.",
    };
  }

  if (status === InvestmentStatus.failed) {
    return {
      ...base,
      situation: "failed",
      statusLabel: "Failed",
      statusDetail: "This investment could not be completed.",
    };
  }

  if (status === InvestmentStatus.redeeming) {
    return {
      ...base,
      situation: "redeeming",
      statusLabel: "Claiming…",
      statusDetail: "Your payout is being sent on-chain.",
    };
  }

  if (status === InvestmentStatus.redeemed) {
    const detail =
      investment.payoutReason?.trim() || "Payout completed.";
    return {
      ...base,
      situation: "redeemed",
      statusLabel: "Redeemed",
      statusDetail: detail,
    };
  }

  if (status === InvestmentStatus.referral_recovered) {
    return {
      ...base,
      situation: "referral_recovered",
      statusLabel: "Principal recovered",
      statusDetail: "Your principal was recovered through invites.",
    };
  }

  if (status === InvestmentStatus.forfeited) {
    const label = forfeitureLabel(investment.forfeitureReason);
    return {
      ...base,
      situation: "forfeited",
      statusLabel: label,
      statusDetail: forfeitureDetail(investment.forfeitureReason),
      chosenPath:
        investment.unpaidMaturityResolution ===
        UnpaidMaturityResolution.term_extension
          ? "term_extension"
          : investment.unpaidMaturityResolution ===
              UnpaidMaturityResolution.referral_recovery
            ? "referral_recovery"
            : null,
    };
  }

  if (
    status === InvestmentStatus.active &&
    investment.unpaidMaturityResolution ===
      UnpaidMaturityResolution.term_extension
  ) {
    const maturesIso = iso(investment.maturesAt);
    const days = investment.termExtensionDays;
    return {
      ...base,
      situation: "extended_active",
      statusLabel: "Extended — waiting",
      statusDetail:
        days != null
          ? `You chose to wait ${days} more days for another payout attempt when the term ends.`
          : "You chose to wait longer for another payout attempt when the term ends.",
      chosenPath: "term_extension",
      nextDeadlineAt: maturesIso,
      nextDeadlineLabel: "Extended term ends",
    };
  }

  if (status === InvestmentStatus.active) {
    return {
      ...base,
      situation: "active",
      statusLabel: "Active",
      statusDetail: "Your investment is active until its maturity date.",
      nextDeadlineAt: iso(investment.maturesAt),
      nextDeadlineLabel: "Matures",
    };
  }

  if (status !== InvestmentStatus.matured) {
    return base;
  }

  if (choicePending) {
    return {
      ...base,
      situation: "choice_required",
      statusLabel: "Choose next step",
      statusDetail:
        "Your term ended but payout is waiting on pool liquidity. Choose within 48 hours to wait longer or invite two friends to recover your principal.",
      nextDeadlineAt: choiceDeadlineIso,
      nextDeadlineLabel: "Choice deadline",
    };
  }

  if (
    investment.recoveryEligibleAt &&
    !investment.referralRecoveryCompletedAt &&
    investment.unpaidMaturityResolution ===
      UnpaidMaturityResolution.referral_recovery
  ) {
    const expires = recoveryExpiresAt(investment.recoveryEligibleAt);
    const qualified = context.recoveryQualifiedCount ?? 0;
    const required = context.recoveryRequiredCount ?? 2;
    return {
      ...base,
      situation: "recovery_in_progress",
      statusLabel: "Recover via invites",
      statusDetail: `You chose invite recovery. ${qualified} of ${required} friends have invested through your link.`,
      chosenPath: "referral_recovery",
      nextDeadlineAt: expires.toISOString(),
      nextDeadlineLabel: "Recovery deadline",
    };
  }

  if (investment.payoutUnlockedAt) {
    return {
      ...base,
      situation: "awaiting_admin_payout",
      statusLabel: "Awaiting admin payout",
      statusDetail:
        "Your payout is unlocked. Our team will process the transfer according to treasury operations.",
    };
  }

  if (investment.globalQueueRank != null) {
    const rank = investment.globalQueueRank;
    return {
      ...base,
      situation: "waiting_liquidity",
      statusLabel: `Payout queue #${rank}`,
      statusDetail: `You are in the global payout queue (position #${rank}). Waiting for pool liquidity and queue processing.`,
    };
  }

  if (
    investment.unpaidMaturityChoiceDeadlineAt &&
    !isChoiceDeadlineActive(investment.unpaidMaturityChoiceDeadlineAt, now) &&
    investment.unpaidMaturityResolution == null
  ) {
    return {
      ...base,
      situation: "waiting_liquidity",
      statusLabel: "Payout pending",
      statusDetail:
        "Your term ended. The choice window closed without a selection; payout depends on pool liquidity and queue order.",
    };
  }

  return {
    ...base,
    situation: "waiting_unlock",
    statusLabel: "Waiting for pool activity",
    statusDetail:
      "Your term ended. Payout is waiting on pool activity. We'll notify you when your position moves forward.",
  };
}

export function getUserStatusLabelFromSituation(view: MaturitySituationView): string {
  return view.statusLabel;
}
