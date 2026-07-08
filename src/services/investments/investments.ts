import { isValidObjectId } from "@/lib/validators/objectId";
import { prisma } from "@/lib/prisma";
import { enrichInvestmentWithContext, loadInvestmentEnrichmentContext } from "@/services/investments/investmentEnrichmentContext";
import type { EnrichedInvestmentJson } from "@/lib/serializers/investment";
import { healStuckUnpaidMaturityChoiceDeadlines } from "@/services/investments/unpaidMaturityChoice";

export type InvestmentsServiceResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown> | string;
      plainText?: boolean;
    };

export async function getUserInvestments(userId: string) {
  const { markMaturedInvestments } = await import("@/services/investments/maturity");
  const { refreshRecoveryEligibilityForUser } = await import(
    "@/services/referrals/recoveryEligibility"
  );
  const { processInvestmentForfeitures } = await import(
    "@/services/investments/investmentForfeiture"
  );
  await markMaturedInvestments();
  await processInvestmentForfeitures();
  await refreshRecoveryEligibilityForUser(userId);
  await healStuckUnpaidMaturityChoiceDeadlines(userId);

  const investments = await prisma.investment.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });

  const enrichmentContext = await loadInvestmentEnrichmentContext(
    userId,
    investments
  );

  return investments.map((investment) =>
    enrichInvestmentWithContext(investment, enrichmentContext)
  );
}

export async function redeemInvestment(
  userId: string,
  investmentId: string
): Promise<
  InvestmentsServiceResult<{
    msg: string;
    investment: EnrichedInvestmentJson;
  }>
> {
  if (!isValidObjectId(investmentId)) {
    return {
      ok: false,
      status: 400,
      body: { msg: "Invalid investment id" },
    };
  }

  try {
    const investment = await prisma.investment.findFirst({
      where: { id: investmentId, userId },
    });

    if (!investment) {
      return {
        ok: false,
        status: 404,
        body: { msg: "Investment not found" },
      };
    }

    return {
      ok: false,
      status: 403,
      body: {
        msg: "Payouts are processed by our team. You will be notified when your payout is sent.",
        code: "manual_payout_fulfillment",
      },
    };
  } catch (error) {
    console.error(
      "[redeemInvestment]",
      error instanceof Error ? error.message : error
    );
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}
