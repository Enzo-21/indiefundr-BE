import {
  ForfeitureReason,
  InvestmentStatus,
  TreasuryEventType,
  type Investment,
  type Prisma,
} from "@prisma/client";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { prisma } from "@/lib/prisma";
import { fieldIsNullOrUnset } from "@/lib/prisma/mongoFieldFilters";
import { notifyInvestmentForfeited } from "@/services/investments/forfeitureNotifications";
import { getLedgerSnapshot } from "@/services/revenueEngine/ledger";
import {
  isUnpaidMaturityChoicePending,
  loadFifoEligibleIds,
} from "@/services/investments/unpaidMaturityChoice";
import {
  isRecoveryWindowActive,
} from "@/lib/config/referralRecovery";
import { UnpaidMaturityResolution } from "@prisma/client";

export const FORFEITURE_CRON_BATCH_SIZE = 5;

const TERMINAL_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.redeemed,
  InvestmentStatus.referral_recovered,
  InvestmentStatus.forfeited,
  InvestmentStatus.failed,
];

export type ForfeitInvestmentResult =
  | { ok: true; investment: Investment; alreadyForfeited: boolean }
  | { ok: false; reason: string };

export async function recordObligationForfeiture(
  investment: Pick<
    Investment,
    "id" | "projectedPayoutUsdt" | "amountUsdt" | "fundId"
  >,
  reason: ForfeitureReason
) {
  const existing = await prisma.treasuryEvent.findFirst({
    where: {
      type: TreasuryEventType.obligation_forfeiture,
      investmentId: investment.id,
    },
    select: { id: true },
  });
  if (existing) return;

  const ledger = await getLedgerSnapshot();
  const amount = ledgerTruncateUsdt(investment.projectedPayoutUsdt);

  await prisma.treasuryEvent.create({
    data: {
      type: TreasuryEventType.obligation_forfeiture,
      amountUsdt: amount,
      poolAfter: ledgerTruncateUsdt(ledger.poolAvailable),
      surplusAfter: ledgerTruncateUsdt(ledger.treasurySurplus),
      protectedCreditedAfter: ledgerTruncateUsdt(ledger.protectedRevenueCredited),
      protectedWithdrawnAfter: ledgerTruncateUsdt(
        ledger.protectedRevenueWithdrawn
      ),
      investmentId: investment.id,
      meta: {
        reason,
        principalUsdt: investment.amountUsdt,
        projectedPayoutUsdt: investment.projectedPayoutUsdt,
        fundId: investment.fundId,
      } satisfies Prisma.InputJsonValue,
    },
  });
}

export async function forfeitInvestment(
  investmentId: string,
  reason: ForfeitureReason
): Promise<ForfeitInvestmentResult> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
  });

  if (!investment) {
    return { ok: false, reason: "Investment not found" };
  }

  if (investment.status === InvestmentStatus.forfeited) {
    return { ok: true, investment, alreadyForfeited: true };
  }

  if (TERMINAL_STATUSES.includes(investment.status)) {
    return { ok: false, reason: `Cannot forfeit investment in status ${investment.status}` };
  }

  if (
    investment.status === InvestmentStatus.redeeming &&
    !investment.payoutFailureReason
  ) {
    return { ok: false, reason: "Payout in progress" };
  }

  const now = new Date();
  const updated = await prisma.investment.update({
    where: { id: investmentId },
    data: {
      status: InvestmentStatus.forfeited,
      forfeitedAt: now,
      forfeitureReason: reason,
      recoveryEligibleAt: null,
    },
  });

  await recordObligationForfeiture(updated, reason);

  await notifyInvestmentForfeited(updated);

  return { ok: true, investment: updated, alreadyForfeited: false };
}

export type ProcessInvestmentForfeituresResult = {
  count: number;
  forfeitedIds: string[];
  pendingCount: number;
};

export async function processInvestmentForfeitures(options?: {
  limit?: number;
  now?: Date;
}): Promise<ProcessInvestmentForfeituresResult> {
  const now = options?.now ?? new Date();
  const fifoIds = await loadFifoEligibleIds();

  const expiredChoice = await prisma.investment.findMany({
    where: {
      AND: [
        { status: InvestmentStatus.matured },
        fieldIsNullOrUnset("unpaidMaturityResolution"),
        { unpaidMaturityChoiceDeadlineAt: { lte: now } },
        fieldIsNullOrUnset("payoutUnlockedAt"),
        fieldIsNullOrUnset("referralRecoveryCompletedAt"),
      ],
    },
    orderBy: [{ unpaidMaturityChoiceDeadlineAt: "asc" }, { id: "asc" }],
    ...(options?.limit != null ? { take: options.limit } : {}),
    select: {
      id: true,
      status: true,
      payoutUnlockedAt: true,
      referralRecoveryCompletedAt: true,
      unpaidMaturityResolution: true,
      unpaidMaturityChoiceDeadlineAt: true,
      subscribedAt: true,
      projectedPayoutUsdt: true,
      maturesAt: true,
    },
  });

  const recoveryExpired = await prisma.investment.findMany({
    where: {
      AND: [
        { status: InvestmentStatus.matured },
        { unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery },
        fieldIsNullOrUnset("referralRecoveryCompletedAt"),
        { recoveryEligibleAt: { not: null } },
        fieldIsNullOrUnset("payoutUnlockedAt"),
      ],
    },
    orderBy: [{ recoveryEligibleAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      recoveryEligibleAt: true,
    },
  });

  const forfeitedIds: string[] = [];

  for (const row of expiredChoice) {
    if (!isUnpaidMaturityChoicePending(row, fifoIds)) continue;
    const result = await forfeitInvestment(
      row.id,
      ForfeitureReason.choice_deadline_expired
    );
    if (result.ok && !result.alreadyForfeited) {
      forfeitedIds.push(row.id);
    }
  }

  const remainingLimit =
    options?.limit != null
      ? Math.max(0, options.limit - forfeitedIds.length)
      : undefined;

  const recoveryToProcess =
    remainingLimit === 0
      ? []
      : recoveryExpired
          .filter(
            (row) =>
              row.recoveryEligibleAt &&
              !isRecoveryWindowActive(row.recoveryEligibleAt, now)
          )
          .slice(0, remainingLimit);

  for (const row of recoveryToProcess) {
    const result = await forfeitInvestment(
      row.id,
      ForfeitureReason.recovery_window_expired
    );
    if (result.ok && !result.alreadyForfeited) {
      forfeitedIds.push(row.id);
    }
  }

  const pendingCount = await prisma.investment.count({
    where: {
      OR: [
        {
          AND: [
            { status: InvestmentStatus.matured },
            fieldIsNullOrUnset("unpaidMaturityResolution"),
            { unpaidMaturityChoiceDeadlineAt: { lte: now } },
            fieldIsNullOrUnset("payoutUnlockedAt"),
            fieldIsNullOrUnset("referralRecoveryCompletedAt"),
          ],
        },
        {
          AND: [
            { status: InvestmentStatus.matured },
            { unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery },
            fieldIsNullOrUnset("referralRecoveryCompletedAt"),
            { recoveryEligibleAt: { not: null } },
            fieldIsNullOrUnset("payoutUnlockedAt"),
          ],
        },
      ],
    },
  });

  return {
    count: forfeitedIds.length,
    forfeitedIds,
    pendingCount,
  };
}

export function isForfeitureCandidateOnMaturity(
  investment: Pick<Investment, "unpaidMaturityResolution">
): boolean {
  return (
    investment.unpaidMaturityResolution ===
    UnpaidMaturityResolution.term_extension
  );
}
