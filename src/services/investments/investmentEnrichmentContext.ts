import type { Investment } from "@prisma/client";
import { getRecoveryInviteesRequired } from "@/lib/config/referralRecovery";
import {
  enrichInvestment,
  type EnrichInvestmentOptions,
  type EnrichedInvestmentJson,
} from "@/lib/serializers/investment";
import { prisma } from "@/lib/prisma";
import {
  getUnpaidMaturityChoiceContext,
  loadFifoEligibleIds,
} from "@/services/investments/unpaidMaturityChoice";
import { getPowerInventory } from "@/services/playerPowers/playerPowers";

export type InvestmentEnrichmentContext = {
  fifoEligibleIds: ReadonlySet<string>;
  qualifiedByInvestment: Map<string, number>;
  powers: Awaited<ReturnType<typeof getPowerInventory>>;
};

export async function loadInvestmentEnrichmentContext(
  userId: string,
  investments: Investment[]
): Promise<InvestmentEnrichmentContext> {
  const recoveryIds = investments
    .filter(
      (row) =>
        row.recoveryEligibleAt &&
        !row.referralRecoveryCompletedAt &&
        row.status === "matured"
    )
    .map((row) => row.id);

  const recoveryLinks =
    recoveryIds.length > 0
      ? await prisma.referralRecoveryLink.findMany({
          where: { investmentId: { in: recoveryIds } },
          select: { investmentId: true, inviteIds: true },
        })
      : [];

  const qualifiedByInvestment = new Map(
    recoveryLinks.map((link) => [link.investmentId, link.inviteIds.length])
  );

  const fifoEligibleIds = await loadFifoEligibleIds();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true },
  });
  const powers = await getPowerInventory(userId, user?.level ?? 0);

  return { fifoEligibleIds, qualifiedByInvestment, powers };
}

export function buildEnrichInvestmentOptions(
  investment: Investment,
  context: InvestmentEnrichmentContext
): EnrichInvestmentOptions {
  const choiceCtx = getUnpaidMaturityChoiceContext(
    investment,
    context.fifoEligibleIds,
    context.powers
  );
  return {
    fifoEligibleIds: context.fifoEligibleIds,
    recoveryQualifiedCount:
      context.qualifiedByInvestment.get(investment.id) ?? null,
    recoveryRequiredCount: investment.recoveryEligibleAt
      ? getRecoveryInviteesRequired(investment.amountUsdt)
      : null,
    canChooseReferralRecovery: choiceCtx?.canChooseReferralRecovery ?? false,
    canChooseTermExtension: choiceCtx?.canChooseTermExtension ?? false,
    extensionMinDays: choiceCtx?.extensionMinDays ?? null,
    extensionMaxDays: choiceCtx?.extensionMaxDays ?? null,
  };
}

export function enrichInvestmentWithContext(
  investment: Investment,
  context: InvestmentEnrichmentContext
): EnrichedInvestmentJson {
  return enrichInvestment(
    investment,
    buildEnrichInvestmentOptions(investment, context)
  );
}

export function enrichInvestmentsWithContext(
  investments: Investment[],
  context: InvestmentEnrichmentContext
): Map<string, EnrichedInvestmentJson> {
  return new Map(
    investments.map((investment) => [
      investment.id,
      enrichInvestmentWithContext(investment, context),
    ])
  );
}
