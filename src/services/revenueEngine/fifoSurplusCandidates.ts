import { prisma } from "@/lib/prisma";
import { getLedgerSnapshot } from "@/services/revenueEngine/ledger";
import {
  computeFifoSurplusEligibleInvestmentIds,
  PAYOUT_CANDIDATE_STATUSES,
  type FifoSurplusPayoutCandidate,
} from "@/services/revenueEngine/payoutScheduler";

const FIFO_SURPLUS_CANDIDATE_SELECT = {
  id: true,
  subscribedAt: true,
  status: true,
  projectedPayoutUsdt: true,
  payoutUnlockedAt: true,
  redemptionTransaction: true,
  maturesAt: true,
  unpaidMaturityResolution: true,
  referralRecoveryCompletedAt: true,
  unpaidMaturityChoiceDeadlineAt: true,
} as const;

/** Active + matured investments in subscribe-date FIFO order (same set as admin surplus). */
export async function loadFifoSurplusCandidateInvestments(): Promise<
  FifoSurplusPayoutCandidate[]
> {
  return prisma.investment.findMany({
    where: {
      status: { in: PAYOUT_CANDIDATE_STATUSES },
      subscribedAt: { not: null },
    },
    orderBy: [{ subscribedAt: "asc" }, { id: "asc" }],
    select: FIFO_SURPLUS_CANDIDATE_SELECT,
  });
}

export async function loadFifoEligibleIds(
  now: Date = new Date()
): Promise<Set<string>> {
  const [ledger, candidates] = await Promise.all([
    getLedgerSnapshot(),
    loadFifoSurplusCandidateInvestments(),
  ]);
  return computeFifoSurplusEligibleInvestmentIds(candidates, ledger, now);
}
