import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
} from "@prisma/client";
import { newSubscribersNeeded, REVENUE_ENGINE_ENABLED } from "@/lib/config/revenueEngine";
import { isPastPayoutEligible } from "@/lib/investments/presentation";
import { prisma } from "@/lib/prisma";
import { getLedgerSnapshot } from "./ledger";
import { buildGlobalQueue, getQueueHead } from "./queue";
import { canFundFromPool, getPoolMin, sumObligationsRest } from "./pool";

export type LastEvaluation = {
  queue: string[];
  headId: string | null;
  evaluatedAt: Date | null;
  poolAvailable?: number;
  treasurySurplus?: number;
};

let lastEvaluation: LastEvaluation = {
  queue: [],
  headId: null,
  evaluatedAt: null,
};

export function getLastEvaluation(): LastEvaluation {
  return lastEvaluation;
}

export async function evaluateAll(): Promise<{
  updated: number;
  headId?: string | null;
  poolAvailable?: number;
}> {
  if (!REVENUE_ENGINE_ENABLED()) {
    return { updated: 0 };
  }

  const ledger = await getLedgerSnapshot();
  const matured = await prisma.investment.findMany({
    where: { status: InvestmentStatus.matured },
    orderBy: { subscribedAt: "asc" },
  });

  const queue = buildGlobalQueue(matured);
  const head = getQueueHead(queue);
  const headId = head ? head.id : null;

  let obligationsRest = 0;
  if (head) {
    obligationsRest = sumObligationsRest(queue, head.id);
  }

  const updates: ReturnType<typeof prisma.investment.update>[] = [];

  for (let rank = 0; rank < queue.length; rank++) {
    const inv = queue[rank];
    const isHead = headId !== null && inv.id === headId;
    let payabilityStatus: InvestmentPayabilityStatus =
      InvestmentPayabilityStatus.pending_liquidity;
    let markedPayableAt: Date | undefined;
    let needed: number | null = null;

    if (isHead) {
      const poolMin = getPoolMin(ledger.poolAvailable, inv, obligationsRest);
      const funding = canFundFromPool(
        ledger.poolAvailable,
        poolMin,
        ledger.treasurySurplus
      );
      needed = newSubscribersNeeded(
        ledger.poolAvailable,
        inv.projectedPayoutUsdt
      );

      if (funding.ok && isPastPayoutEligible(inv)) {
        payabilityStatus = InvestmentPayabilityStatus.payable;
        markedPayableAt = new Date();
      }
    }

    updates.push(
      prisma.investment.update({
        where: { id: inv.id },
        data: {
          payabilityStatus,
          globalQueueRank: rank + 1,
          newSubscribersNeeded: isHead ? needed : null,
          ...(markedPayableAt ? { markedPayableAt } : {}),
        },
      })
    );
  }

  const queueIds = new Set(queue.map((i) => i.id));
  for (const inv of matured) {
    if (!queueIds.has(inv.id)) {
      updates.push(
        prisma.investment.update({
          where: { id: inv.id },
          data: {
            payabilityStatus: InvestmentPayabilityStatus.pending_liquidity,
            globalQueueRank: null,
          },
        })
      );
    }
  }

  await Promise.all(updates);

  lastEvaluation = {
    queue: queue.map((i) => i.id),
    headId,
    evaluatedAt: new Date(),
    poolAvailable: ledger.poolAvailable,
    treasurySurplus: ledger.treasurySurplus,
  };

  return {
    updated: queue.length,
    headId,
    poolAvailable: ledger.poolAvailable,
  };
}
