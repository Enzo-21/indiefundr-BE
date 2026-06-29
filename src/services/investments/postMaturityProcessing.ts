import {
  ForfeitureReason,
  InvestmentPayabilityStatus,
  InvestmentStatus,
  UnpaidMaturityResolution,
} from "@prisma/client";
import { choiceDeadlineAt } from "@/lib/config/unpaidMaturityChoice";
import { prisma } from "@/lib/prisma";
import {
  forfeitInvestment,
  isForfeitureCandidateOnMaturity,
} from "@/services/investments/investmentForfeiture";
import { loadFifoEligibleIds } from "@/services/investments/unpaidMaturityChoice";
import { isRecoveryCandidate } from "@/services/referrals/recoveryEligibility";

export async function processNewlyMaturedInvestment(
  investmentId: string,
  now: Date = new Date()
): Promise<void> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
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

  if (!investment || investment.status !== InvestmentStatus.matured) {
    return;
  }

  if (isForfeitureCandidateOnMaturity(investment)) {
    await forfeitInvestment(
      investment.id,
      ForfeitureReason.second_maturity_unpaid
    );
    return;
  }

  if (investment.payoutUnlockedAt) {
    return;
  }

  const fifoIds = await loadFifoEligibleIds();
  if (!isRecoveryCandidate(investment, fifoIds)) {
    return;
  }

  if (investment.unpaidMaturityChoiceDeadlineAt) {
    return;
  }

  await prisma.investment.update({
    where: { id: investment.id },
    data: {
      unpaidMaturityChoiceDeadlineAt: choiceDeadlineAt(now),
      payabilityStatus: InvestmentPayabilityStatus.pending_liquidity,
    },
  });
}

export async function processNewlyMaturedInvestments(
  investmentIds: string[],
  now: Date = new Date()
): Promise<void> {
  for (const id of investmentIds) {
    await processNewlyMaturedInvestment(id, now);
  }
}
