import { InvestmentStatus } from "@prisma/client";
import { isExcludedFromNormalPayout, normalPayoutExclusionReason } from "@/lib/investments/referralRecoveryNormalPayout";
import { prisma } from "@/lib/prisma";
import type {
  AdminInvestmentsCurrentLedger,
  AdminInvestmentsPayoutAvailability,
} from "@/services/admin/investmentAdminTypes";
import { getLedgerSnapshot } from "@/services/revenueEngine/ledger";
import { loadFifoSurplusCandidateInvestments } from "@/services/revenueEngine/fifoSurplusCandidates";
import {
  computeFifoSurplusEligibleInvestmentIds,
  getSurplusPayoutEligibilityWithFifo,
} from "@/services/revenueEngine/payoutScheduler";

const PAYOUT_ACTION_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.active,
  InvestmentStatus.matured,
  InvestmentStatus.redeeming,
];

function payNowBlockReason(inv: {
  status: InvestmentStatus;
  payoutUnlockedAt: Date | null;
  payoutFailureReason: string | null;
  unpaidMaturityResolution: import("@prisma/client").UnpaidMaturityResolution | null;
  referralRecoveryCompletedAt: Date | null;
  unpaidMaturityChoiceDeadlineAt: Date | null;
}): string | null {
  const exclusion = normalPayoutExclusionReason(inv);
  if (exclusion === "unpaid_maturity_choice_pending") {
    return "48h maturity choice open — user must pick recover or wait";
  }
  if (exclusion === "referral_recovery_path") {
    return "Referral recovery path (principal via qualified invites only)";
  }
  if (inv.status === InvestmentStatus.redeemed) {
    return "Already paid";
  }
  if (
    inv.status === InvestmentStatus.redeeming &&
    !inv.payoutFailureReason
  ) {
    return "Payout in progress";
  }
  if (
    inv.status !== InvestmentStatus.active &&
    inv.status !== InvestmentStatus.matured &&
    !(
      inv.status === InvestmentStatus.redeeming && inv.payoutFailureReason
    )
  ) {
    return `Status: ${inv.status}`;
  }
  if (!inv.payoutUnlockedAt) {
    return "Waiting for two-user unlock";
  }
  return null;
}

function showPayoutActionsForInvestment(inv: {
  status: InvestmentStatus;
  payoutFailureReason: string | null;
  unpaidMaturityResolution: import("@prisma/client").UnpaidMaturityResolution | null;
  referralRecoveryCompletedAt: Date | null;
  unpaidMaturityChoiceDeadlineAt: Date | null;
}): boolean {
  if (isExcludedFromNormalPayout(inv)) {
    return false;
  }
  if (inv.status === InvestmentStatus.redeemed) {
    return false;
  }
  if (
    inv.status === InvestmentStatus.redeeming &&
    !inv.payoutFailureReason
  ) {
    return false;
  }
  return (
    inv.status === InvestmentStatus.active ||
    inv.status === InvestmentStatus.matured ||
    (inv.status === InvestmentStatus.redeeming &&
      Boolean(inv.payoutFailureReason))
  );
}

async function loadPayoutActionInvestments() {
  return prisma.investment.findMany({
    where: {
      status: { in: PAYOUT_ACTION_STATUSES },
      OR: [
        { status: { not: InvestmentStatus.redeeming } },
        { payoutFailureReason: { not: null } },
      ],
    },
    select: {
      id: true,
      status: true,
      payoutUnlockedAt: true,
      payoutFailureReason: true,
      subscribedAt: true,
      projectedPayoutUsdt: true,
      redemptionTransaction: true,
      maturesAt: true,
      unpaidMaturityResolution: true,
      referralRecoveryCompletedAt: true,
      unpaidMaturityChoiceDeadlineAt: true,
    },
  });
}

function toCurrentLedger(
  ledger: Awaited<ReturnType<typeof getLedgerSnapshot>>
): AdminInvestmentsCurrentLedger {
  return {
    poolAvailable: ledger.poolAvailable,
    treasurySurplus: ledger.treasurySurplus,
    poolLiquidity: ledger.poolLiquidity,
    protectedRevenueAvailable: ledger.protectedRevenueAvailable,
  };
}

export async function loadAdminInvestmentsContext(): Promise<{
  ledger: Awaited<ReturnType<typeof getLedgerSnapshot>>;
  fifoEligibleIds: Set<string>;
  currentLedger: AdminInvestmentsCurrentLedger;
  payoutAvailability: AdminInvestmentsPayoutAvailability;
}> {
  const [ledger, fifoCandidates, actionInvestments] = await Promise.all([
    getLedgerSnapshot(),
    loadFifoSurplusCandidateInvestments(),
    loadPayoutActionInvestments(),
  ]);

  const now = new Date();
  const fifoEligibleIds = computeFifoSurplusEligibleInvestmentIds(
    fifoCandidates,
    ledger,
    now
  );

  let unlockedPayoutCount = 0;
  let surplusPayoutCount = 0;

  for (const inv of actionInvestments) {
    const payNowBlocked = payNowBlockReason(inv);
    const canPayNow = payNowBlocked == null;
    const showPayoutActions = showPayoutActionsForInvestment(inv);

    if (canPayNow && showPayoutActions) {
      unlockedPayoutCount++;
    }

    const surplusEligibility = getSurplusPayoutEligibilityWithFifo(
      inv,
      ledger,
      fifoEligibleIds,
      now
    );
    if (surplusEligibility.eligibleForLiquiditySurplusPay && !canPayNow) {
      surplusPayoutCount++;
    }
  }

  return {
    ledger,
    fifoEligibleIds,
    currentLedger: toCurrentLedger(ledger),
    payoutAvailability: {
      unlockedPayoutCount,
      surplusPayoutCount,
    },
  };
}

export async function getAdminPayoutSummary(): Promise<{
  currentLedger: AdminInvestmentsCurrentLedger;
  payoutAvailability: AdminInvestmentsPayoutAvailability;
}> {
  const context = await loadAdminInvestmentsContext();
  return {
    currentLedger: context.currentLedger,
    payoutAvailability: context.payoutAvailability,
  };
}
