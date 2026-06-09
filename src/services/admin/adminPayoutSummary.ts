import { InvestmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AdminInvestmentsCurrentLedger,
  AdminInvestmentsPayoutAvailability,
} from "@/services/admin/investmentAdminTypes";
import { getLedgerSnapshot } from "@/services/revenueEngine/ledger";
import {
  computeFifoSurplusEligibleInvestmentIds,
  getSurplusPayoutEligibilityWithFifo,
  PAYOUT_CANDIDATE_STATUSES,
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
}): string | null {
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
}): boolean {
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

async function loadFifoSurplusCandidates() {
  return prisma.investment.findMany({
    where: {
      status: { in: PAYOUT_CANDIDATE_STATUSES },
      subscribedAt: { not: null },
    },
    orderBy: [{ subscribedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      subscribedAt: true,
      status: true,
      projectedPayoutUsdt: true,
      payoutUnlockedAt: true,
      redemptionTransaction: true,
      maturesAt: true,
    },
  });
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
    loadFifoSurplusCandidates(),
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
