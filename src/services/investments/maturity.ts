import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { onInvestmentMatured } from "@/services/revenueEngine/onInvestmentMatured";

export async function markMaturedInvestments(): Promise<number> {
  const now = new Date();
  const toMature = await prisma.investment.findMany({
    where: {
      status: InvestmentStatus.active,
      maturesAt: { lte: now },
    },
  });

  for (const investment of toMature) {
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
  }

  if (toMature.length > 0) {
    await onInvestmentMatured();
  }

  return toMature.length;
}
