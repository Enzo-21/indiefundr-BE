import { UnpaidMaturityResolution } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFundById } from "@/lib/config/investmentFunds";
import { parsePrincipalRecoveryInvestmentId } from "@/services/referrals/referralWalletActivity";

export type PrincipalRecoveryInsights = {
  investmentId: string;
  fundName: string;
  investedAt: string;
  maturedAt: string | null;
  recoveryChosenAt: string | null;
  recoveryCompletedAt: string | null;
  invitees: Array<{ displayName: string; qualifiedAt: string | null }>;
};

type ActivityRowLike = {
  kind: string;
  entityId: string | null;
};

export function principalRecoveryInsightsKey(
  kind: string,
  entityId: string
): string {
  return `${kind}:${entityId}`;
}

export async function hydratePrincipalRecoveryInsightsBatch(
  userId: string,
  rows: ActivityRowLike[]
): Promise<Map<string, PrincipalRecoveryInsights>> {
  const result = new Map<string, PrincipalRecoveryInsights>();
  const investmentIds = new Set<string>();

  for (const row of rows) {
    if (row.kind !== "referral_principal_recovery" || !row.entityId) {
      continue;
    }
    const investmentId = parsePrincipalRecoveryInvestmentId(row.entityId);
    if (investmentId) {
      investmentIds.add(investmentId);
    }
  }

  if (investmentIds.size === 0) {
    return result;
  }

  const [investments, recoveryLinks] = await Promise.all([
    prisma.investment.findMany({
      where: { userId, id: { in: [...investmentIds] } },
      select: {
        id: true,
        fundId: true,
        subscribedAt: true,
        date: true,
        maturesAt: true,
        unpaidMaturityResolution: true,
        unpaidMaturityResolvedAt: true,
        referralRecoveryCompletedAt: true,
      },
    }),
    prisma.referralRecoveryLink.findMany({
      where: { inviterUserId: userId, investmentId: { in: [...investmentIds] } },
      select: {
        investmentId: true,
        inviteIds: true,
        completedAt: true,
      },
    }),
  ]);

  const investmentsById = new Map(investments.map((inv) => [inv.id, inv]));
  const linksByInvestmentId = new Map(
    recoveryLinks.map((link) => [link.investmentId, link])
  );

  const allInviteIds = [
    ...new Set(recoveryLinks.flatMap((link) => link.inviteIds)),
  ];
  const invites =
    allInviteIds.length > 0
      ? await prisma.referralInvite.findMany({
          where: { id: { in: allInviteIds }, inviterUserId: userId },
          select: {
            id: true,
            qualifiedAt: true,
            invitee: { select: { name: true } },
          },
        })
      : [];
  const invitesById = new Map(invites.map((invite) => [invite.id, invite]));

  for (const row of rows) {
    if (row.kind !== "referral_principal_recovery" || !row.entityId) {
      continue;
    }
    const investmentId = parsePrincipalRecoveryInvestmentId(row.entityId);
    if (!investmentId) {
      continue;
    }
    const investment = investmentsById.get(investmentId);
    if (!investment) {
      continue;
    }

    const fund = getFundById(investment.fundId);
    const link = linksByInvestmentId.get(investmentId);
    const investedAt = investment.subscribedAt ?? investment.date;
    const recoveryChosenAt =
      investment.unpaidMaturityResolution ===
      UnpaidMaturityResolution.referral_recovery
        ? (investment.unpaidMaturityResolvedAt?.toISOString() ?? null)
        : null;
    const recoveryCompletedAt =
      link?.completedAt?.toISOString() ??
      investment.referralRecoveryCompletedAt?.toISOString() ??
      null;

    const invitees = (link?.inviteIds ?? []).map((inviteId) => {
      const invite = invitesById.get(inviteId);
      return {
        displayName: invite?.invitee.name ?? "Invited friend",
        qualifiedAt: invite?.qualifiedAt?.toISOString() ?? null,
      };
    });

    result.set(principalRecoveryInsightsKey(row.kind, row.entityId), {
      investmentId,
      fundName: fund?.name ?? investment.fundId,
      investedAt: investedAt.toISOString(),
      maturedAt: investment.maturesAt?.toISOString() ?? null,
      recoveryChosenAt,
      recoveryCompletedAt,
      invitees,
    });
  }

  return result;
}
