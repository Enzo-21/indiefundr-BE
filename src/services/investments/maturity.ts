import {
  ForfeitureReason,
  InvestmentPayabilityStatus,
  InvestmentStatus,
  UnpaidMaturityResolution,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { forfeitInvestment } from "@/services/investments/investmentForfeiture";
import { processNewlyMaturedInvestments } from "@/services/investments/postMaturityProcessing";
import { onInvestmentMatured } from "@/services/revenueEngine/onInvestmentMatured";

export const MATURITY_CRON_BATCH_SIZE = 5;

export type MaturedInvestmentSummary = {
  id: string;
  userId: string;
  fundId: string;
};

export type MarkMaturedInvestmentsResult = {
  count: number;
  matured: MaturedInvestmentSummary[];
  pendingCount: number;
};

function overdueActiveWhere(now: Date) {
  return {
    status: InvestmentStatus.active,
    maturesAt: { lte: now },
  } as const;
}

export async function markMaturedInvestments(options?: {
  limit?: number;
}): Promise<MarkMaturedInvestmentsResult> {
  const now = new Date();
  const where = overdueActiveWhere(now);

  const toMature = await prisma.investment.findMany({
    where,
    orderBy: [{ maturesAt: "asc" }, { id: "asc" }],
    ...(options?.limit != null ? { take: options.limit } : {}),
    select: {
      id: true,
      userId: true,
      fundId: true,
      payoutUnlockedAt: true,
      unpaidMaturityResolution: true,
    },
  });

  const matured: MaturedInvestmentSummary[] = [];
  const maturedIds: string[] = [];

  for (const investment of toMature) {
    if (
      investment.unpaidMaturityResolution ===
      UnpaidMaturityResolution.term_extension
    ) {
      const result = await forfeitInvestment(
        investment.id,
        ForfeitureReason.second_maturity_unpaid
      );
      if (result.ok) {
        continue;
      }
    }

    await prisma.investment.update({
      where: { id: investment.id },
      data: {
        status: InvestmentStatus.matured,
        payabilityStatus: investment.payoutUnlockedAt
          ? InvestmentPayabilityStatus.payable
          : InvestmentPayabilityStatus.pending_liquidity,
        payoutEligibleAt: null,
      },
    });

    matured.push({
      id: investment.id,
      userId: investment.userId,
      fundId: investment.fundId,
    });
    maturedIds.push(investment.id);
  }

  if (maturedIds.length > 0) {
    await processNewlyMaturedInvestments(maturedIds, now);
  }

  if (toMature.length > 0) {
    await onInvestmentMatured();
  }

  const pendingCount = await prisma.investment.count({ where });

  return {
    count: matured.length,
    matured,
    pendingCount,
  };
}
