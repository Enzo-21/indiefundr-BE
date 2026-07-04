import { ForfeitureReason } from "@prisma/client";
import type { MaturitySituationView } from "./maturitySituation";

export type UserFacingMaturityCopy = {
  statusLabel: string;
  statusDetail: string;
};

export function userChoiceRequiredDetail(recoveryRequiredCount: number): string {
  return (
    `Your term ended, but your projected payout isn't ready yet. Choose within 48 hours ` +
    `to give our strategies more time or invite ${recoveryRequiredCount} friends to recover your principal.`
  );
}

export function userWaitingLiquidityLabel(rank: number): string {
  return `Payout in progress (#${rank})`;
}

export function userWaitingLiquidityDetail(rank: number): string {
  return (
    `You're #${rank} in line for payout. We're processing matured investments ` +
    `as returns become available.`
  );
}

export function userWaitingUnlockCopy(): UserFacingMaturityCopy {
  return {
    statusLabel: "Waiting for returns",
    statusDetail:
      "Your term ended. Your projected payout isn't ready yet — we'll notify you when your investment moves forward.",
  };
}

export function userAwaitingPayoutCopy(): UserFacingMaturityCopy {
  return {
    statusLabel: "Payout processing",
    statusDetail: "Your payout is ready. Our team will send your transfer shortly.",
  };
}

export function userForfeitureDetail(
  reason: ForfeitureReason | null,
  recoveryRequiredCount?: number | null
): string {
  if (reason === ForfeitureReason.choice_deadline_expired) {
    return (
      "We couldn't grow your investment to your projected payout in time. We offered you the choice to wait longer " +
      "or recover your principal through invites, but the decision window closed without a response. " +
      "This investment is now closed and no payout will be processed."
    );
  }
  if (reason === ForfeitureReason.second_maturity_unpaid) {
    return "The extended term ended and we still couldn't reach your projected payout.";
  }
  if (reason === ForfeitureReason.recovery_window_expired) {
    const friends =
      recoveryRequiredCount != null && recoveryRequiredCount > 0
        ? recoveryRequiredCount
        : "enough";
    return `The invite recovery window ended before ${friends} friends completed their first investments.`;
  }
  return "This investment is now closed and no payout will be processed.";
}

export function userMaturedWaitingEmailBody(): string {
  return (
    "Your projected payout isn't ready yet. We're working to grow returns through our fund strategies " +
    "and will notify you when your investment moves forward. Track status anytime in your Portfolio."
  );
}

export function userMaturedPayableEmailBody(): string {
  return (
    "Our team will process your payout shortly. You can track the latest status anytime in your Portfolio."
  );
}

export function userUnpaidChoiceEmailIntro(): string {
  return (
    "Your position has reached its maximum term, but your projected payout isn't ready yet."
  );
}

export function userMaturedWaitingPushBody(fundName: string): string {
  return `Your ${fundName} position reached its term. Your projected payout isn't ready yet — we'll notify you when it moves forward.`;
}

function parseInviteCountFromDetail(statusDetail: string): number {
  const match = statusDetail.match(/invite (\d+) friends/);
  return match ? Number.parseInt(match[1], 10) : 2;
}

function parseQueueRank(view: MaturitySituationView): number {
  if (view.globalQueueRank != null) return view.globalQueueRank;
  const match = view.statusLabel.match(/#(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function forfeitureReasonFromLabel(statusLabel: string): ForfeitureReason | null {
  if (statusLabel === "Term ended — no choice made") {
    return ForfeitureReason.choice_deadline_expired;
  }
  if (statusLabel === "Term ended — fund unpaid") {
    return ForfeitureReason.second_maturity_unpaid;
  }
  if (statusLabel === "Recovery window ended") {
    return ForfeitureReason.recovery_window_expired;
  }
  return null;
}

function parseRecoveryRequiredFromDetail(statusDetail: string): number | null {
  const match = statusDetail.match(/before (\d+) friends/);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function toUserFacingMaturityCopy(
  view: MaturitySituationView
): UserFacingMaturityCopy {
  switch (view.situation) {
    case "choice_required":
      return {
        statusLabel: "Choose next step",
        statusDetail: userChoiceRequiredDetail(
          parseInviteCountFromDetail(view.statusDetail)
        ),
      };
    case "waiting_liquidity": {
      const rank = parseQueueRank(view);
      return {
        statusLabel: userWaitingLiquidityLabel(rank),
        statusDetail: userWaitingLiquidityDetail(rank),
      };
    }
    case "waiting_unlock":
      return userWaitingUnlockCopy();
    case "awaiting_admin_payout":
      return userAwaitingPayoutCopy();
    case "forfeited": {
      const reason = forfeitureReasonFromLabel(view.statusLabel);
      const recoveryRequired =
        reason === ForfeitureReason.recovery_window_expired
          ? parseRecoveryRequiredFromDetail(view.statusDetail)
          : null;
      if (reason === ForfeitureReason.second_maturity_unpaid) {
        return {
          statusLabel: "Term ended — no payout",
          statusDetail: userForfeitureDetail(reason, recoveryRequired),
        };
      }
      return {
        statusLabel: view.statusLabel,
        statusDetail: userForfeitureDetail(reason, recoveryRequired),
      };
    }
    default:
      return {
        statusLabel: view.statusLabel,
        statusDetail: view.statusDetail,
      };
  }
}
