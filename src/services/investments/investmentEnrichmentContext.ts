import type { Investment } from "@prisma/client";
import { getRecoveryInviteesRequired } from "@/lib/config/referralRecovery";
import {
  canActivateBoostGivenMaturesAt,
  getBoostInviteesRequired,
  isBoostWindowActive,
} from "@/lib/config/referralBoost";
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
  boostQualifiedByInvestment: Map<string, number>;
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

  const boostIds = investments
    .filter(
      (row) =>
        row.boostActivatedAt &&
        !row.boostCompletedAt &&
        row.status === "active" &&
        isBoostWindowActive(row.boostActivatedAt)
    )
    .map((row) => row.id);

  const [recoveryLinks, boostLinks] = await Promise.all([
    recoveryIds.length > 0
      ? prisma.referralRecoveryLink.findMany({
          where: { investmentId: { in: recoveryIds } },
          select: { investmentId: true, inviteIds: true },
        })
      : Promise.resolve([]),
    boostIds.length > 0
      ? prisma.referralBoostLink.findMany({
          where: {
            investmentId: { in: boostIds },
            cancelledAt: null,
            completedAt: null,
          },
          select: { investmentId: true, inviteIds: true },
        })
      : Promise.resolve([]),
  ]);

  const qualifiedByInvestment = new Map(
    recoveryLinks.map((link) => [link.investmentId, link.inviteIds.length])
  );
  const boostQualifiedByInvestment = new Map(
    boostLinks.map((link) => [link.investmentId, link.inviteIds.length])
  );

  const fifoEligibleIds = await loadFifoEligibleIds();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true },
  });
  const powers = await getPowerInventory(userId, user?.level ?? 0);

  return {
    fifoEligibleIds,
    qualifiedByInvestment,
    boostQualifiedByInvestment,
    powers,
  };
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
  const boostOpen =
    Boolean(investment.boostActivatedAt) &&
    !investment.boostCompletedAt &&
    investment.status === "active" &&
    isBoostWindowActive(investment.boostActivatedAt);

  const canActivateBoost =
    investment.status === "active" &&
    !investment.boostActivatedAt &&
    !investment.boostCompletedAt &&
    !investment.payoutUnlockedAt &&
    context.powers.boost.available > 0 &&
    canActivateBoostGivenMaturesAt(investment.maturesAt);

  return {
    fifoEligibleIds: context.fifoEligibleIds,
    recoveryQualifiedCount:
      context.qualifiedByInvestment.get(investment.id) ?? null,
    recoveryRequiredCount: investment.recoveryEligibleAt
      ? getRecoveryInviteesRequired(investment.amountUsdt)
      : null,
    boostQualifiedCount: boostOpen
      ? (context.boostQualifiedByInvestment.get(investment.id) ?? 0)
      : null,
    boostRequiredCount: boostOpen
      ? getBoostInviteesRequired(investment.amountUsdt)
      : null,
    canActivateBoost,
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
