import { enrichInvestment } from "@/lib/serializers/investment";
import { isValidObjectId } from "@/lib/validators/objectId";
import { prisma } from "@/lib/prisma";
import {
  getUnpaidMaturityChoiceContext,
  loadFifoEligibleIds,
} from "@/services/investments/unpaidMaturityChoice";

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

  const investments = await prisma.investment.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });

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

  const { REFERRAL_RECOVERY_INVITEES_REQUIRED } = await import(
    "@/lib/config/referralRecovery"
  );
  const requiredCount = REFERRAL_RECOVERY_INVITEES_REQUIRED();
  const fifoIds = await loadFifoEligibleIds();

  return investments.map((investment) => {
    const choiceCtx = getUnpaidMaturityChoiceContext(investment, fifoIds);
    return enrichInvestment(investment, {
      recoveryQualifiedCount: qualifiedByInvestment.get(investment.id) ?? null,
      recoveryRequiredCount: investment.recoveryEligibleAt ? requiredCount : null,
      needsUnpaidMaturityChoice: choiceCtx?.needsChoice ?? false,
      extensionMinDays: choiceCtx?.extensionMinDays ?? null,
      extensionMaxDays: choiceCtx?.extensionMaxDays ?? null,
    });
  });
}

export async function redeemInvestment(
  userId: string,
  investmentId: string
): Promise<
  InvestmentsServiceResult<{
    msg: string;
    investment: ReturnType<typeof enrichInvestment>;
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
