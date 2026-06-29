import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  UnpaidMaturityResolution,
  type Investment,
} from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import {
  clampExtensionDays,
  computeInvestmentTermDays,
  extensionBounds,
  hasActiveUnpaidMaturityChoiceWindow,
  isChoiceDeadlineActive,
  UNPAID_MATURITY_CHOICE_HOURS,
} from "@/lib/config/unpaidMaturityChoice";
import { addDuration } from "@/lib/duration/parseDuration";
import { isValidObjectId } from "@/lib/validators/objectId";
import { prisma } from "@/lib/prisma";
import { enrichInvestment } from "@/lib/serializers/investment";
import { getLedgerSnapshot } from "@/services/revenueEngine/ledger";
import { computeFifoSurplusEligibleInvestmentIds } from "@/services/revenueEngine/payoutScheduler";
import { markMaturedInvestments } from "@/services/investments/maturity";
import {
  consumePowerForInvestment,
  getPowerInventory,
  PlayerPowerUnavailableError,
  type PowerInventory,
} from "@/services/playerPowers/playerPowers";
import { sendUnpaidMaturityChoiceConfirmedEmail } from "@/services/mailing/sendUnpaidMaturityChoiceConfirmedEmail";

async function notifyChoiceConfirmedEmail(
  userId: string,
  investment: Awaited<ReturnType<typeof prisma.investment.update>>
) {
  const [user, fund] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    }),
    Promise.resolve(getFundById(investment.fundId)),
  ]);
  if (!user?.email?.trim() || !fund) return;
  const result = await sendUnpaidMaturityChoiceConfirmedEmail({
    user,
    investment,
    fund,
  });
  if (!result.ok) {
    console.warn("[maturity] choice confirmed email failed", {
      investmentId: investment.id,
      error: result.error,
    });
  }
}

function enrichAfterChoice(
  investment: Parameters<typeof enrichInvestment>[0],
  fifoIds: ReadonlySet<string>
) {
  return enrichInvestment(investment, { fifoEligibleIds: fifoIds });
}

export type UnpaidMaturityChoice = "referral_recovery" | "term_extension";

export type UnpaidMaturityChoiceContext = {
  investmentId: string;
  fundId: string;
  fundName: string;
  principalUsdt: number;
  needsChoice: boolean;
  extensionMinDays: number;
  extensionMaxDays: number;
  termDays: number;
  choiceDeadlineAt: string;
  choiceHours: number;
  powers: PowerInventory;
  canChooseReferralRecovery: boolean;
  canChooseTermExtension: boolean;
};

export type UnpaidMaturityChoiceResult =
  | { ok: true; data: ReturnType<typeof enrichInvestment> }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

const UNPAID_MATURITY_CHOICE_CLAIM_FAILED = "UNPAID_MATURITY_CHOICE_CLAIM_FAILED";

const UNPAID_MATURITY_CHOICE_CLAIM_WHERE = {
  unpaidMaturityResolution: null,
  unpaidMaturityChoiceDeadlineAt: { not: null },
} as const;

const CHOICE_INVESTMENT_SELECT = {
  id: true,
  userId: true,
  fundId: true,
  amountUsdt: true,
  status: true,
  payoutUnlockedAt: true,
  referralRecoveryCompletedAt: true,
  recoveryEligibleAt: true,
  unpaidMaturityResolution: true,
  unpaidMaturityChoiceDeadlineAt: true,
  subscribedAt: true,
  projectedPayoutUsdt: true,
  maturesAt: true,
} as const;

export async function loadFifoEligibleIds(): Promise<Set<string>> {
  const ledger = await getLedgerSnapshot();
  const allMatured = await prisma.investment.findMany({
    where: { status: InvestmentStatus.matured },
    select: {
      id: true,
      status: true,
      payoutUnlockedAt: true,
      subscribedAt: true,
      projectedPayoutUsdt: true,
      maturesAt: true,
      redemptionTransaction: true,
      unpaidMaturityResolution: true,
      referralRecoveryCompletedAt: true,
      unpaidMaturityChoiceDeadlineAt: true,
    },
  });
  return computeFifoSurplusEligibleInvestmentIds(allMatured, ledger);
}

export function isUnpaidMaturityChoicePending(
  investment: Pick<
    Investment,
    | "id"
    | "status"
    | "payoutUnlockedAt"
    | "referralRecoveryCompletedAt"
    | "unpaidMaturityResolution"
    | "unpaidMaturityChoiceDeadlineAt"
    | "subscribedAt"
    | "projectedPayoutUsdt"
    | "maturesAt"
  >,
  _fifoEligibleIds: ReadonlySet<string>,
  now: Date = new Date()
): boolean {
  if (investment.payoutUnlockedAt) return false;
  if (investment.referralRecoveryCompletedAt) return false;
  return hasActiveUnpaidMaturityChoiceWindow(investment, now);
}

export function getUnpaidMaturityChoiceContext(
  investment: Pick<
    Investment,
    | "id"
    | "fundId"
    | "amountUsdt"
    | "status"
    | "payoutUnlockedAt"
    | "referralRecoveryCompletedAt"
    | "unpaidMaturityResolution"
    | "unpaidMaturityChoiceDeadlineAt"
    | "subscribedAt"
    | "projectedPayoutUsdt"
    | "maturesAt"
  >,
  fifoEligibleIds: ReadonlySet<string>,
  powers: PowerInventory
): UnpaidMaturityChoiceContext | null {
  const needsChoice = isUnpaidMaturityChoicePending(investment, fifoEligibleIds);
  if (!needsChoice || !investment.unpaidMaturityChoiceDeadlineAt) return null;

  const fund = getFundById(investment.fundId);
  const termDays = computeInvestmentTermDays(investment, fund);
  const bounds = extensionBounds(termDays);

  return {
    investmentId: investment.id,
    fundId: investment.fundId,
    fundName: fund?.name ?? investment.fundId,
    principalUsdt: investment.amountUsdt,
    needsChoice: true,
    extensionMinDays: bounds.minDays,
    extensionMaxDays: bounds.maxDays,
    termDays: bounds.termDays,
    choiceDeadlineAt: investment.unpaidMaturityChoiceDeadlineAt.toISOString(),
    choiceHours: UNPAID_MATURITY_CHOICE_HOURS(),
    powers,
    canChooseReferralRecovery: powers.referral_recovery.available > 0,
    canChooseTermExtension: powers.term_extension.available > 0,
  };
}

export async function getPendingUnpaidMaturityChoiceForUser(
  userId: string,
  userLevel: number
) {
  const { processInvestmentForfeitures } = await import(
    "@/services/investments/investmentForfeiture"
  );
  await markMaturedInvestments();
  await processInvestmentForfeitures();
  const fifoIds = await loadFifoEligibleIds();
  const powers = await getPowerInventory(userId, userLevel);

  const investments = await prisma.investment.findMany({
    where: {
      userId,
      status: InvestmentStatus.matured,
      unpaidMaturityResolution: null,
      payoutUnlockedAt: null,
      referralRecoveryCompletedAt: null,
    },
    select: CHOICE_INVESTMENT_SELECT,
    orderBy: [{ maturesAt: "asc" }, { subscribedAt: "asc" }],
  });

  for (const investment of investments) {
    const ctx = getUnpaidMaturityChoiceContext(investment, fifoIds, powers);
    if (ctx) return ctx;
  }

  return null;
}

export async function applyUnpaidMaturityChoice(
  userId: string,
  investmentId: string,
  choice: UnpaidMaturityChoice,
  extensionDays?: number
): Promise<UnpaidMaturityChoiceResult> {
  if (!isValidObjectId(investmentId)) {
    return {
      ok: false,
      status: 400,
      body: { msg: "Invalid investment id" },
    };
  }

  if (choice !== "referral_recovery" && choice !== "term_extension") {
    return {
      ok: false,
      status: 400,
      body: { msg: "Invalid choice" },
    };
  }

  const { processInvestmentForfeitures } = await import(
    "@/services/investments/investmentForfeiture"
  );
  await markMaturedInvestments();
  await processInvestmentForfeitures();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true },
  });
  const userLevel = user?.level ?? 0;

  const investment = await prisma.investment.findFirst({
    where: { id: investmentId, userId },
    select: CHOICE_INVESTMENT_SELECT,
  });

  if (!investment) {
    return {
      ok: false,
      status: 404,
      body: { msg: "Investment not found" },
    };
  }

  if (investment.unpaidMaturityResolution != null) {
    return {
      ok: false,
      status: 409,
      body: {
        msg: "Unpaid maturity choice already resolved",
        code: "choice_already_resolved",
        unpaidMaturityResolution: investment.unpaidMaturityResolution,
      },
    };
  }

  const fifoIds = await loadFifoEligibleIds();
  if (!isUnpaidMaturityChoicePending(investment, fifoIds)) {
    return {
      ok: false,
      status: 400,
      body: {
        msg: "This investment is not eligible for an unpaid maturity choice",
        code: "not_eligible",
      },
    };
  }

  const now = new Date();

  if (
    investment.unpaidMaturityChoiceDeadlineAt &&
    !isChoiceDeadlineActive(investment.unpaidMaturityChoiceDeadlineAt, now)
  ) {
    return {
      ok: false,
      status: 410,
      body: {
        msg: "The 48-hour choice window has expired",
        code: "choice_deadline_expired",
      },
    };
  }

  try {
    if (choice === "referral_recovery") {
      const updated = await prisma.$transaction(async (tx) => {
        await consumePowerForInvestment(tx, {
          userId,
          userLevel,
          investmentId,
          powerType: choice,
          consumedAt: now,
        });

        const claim = await tx.investment.updateMany({
          where: {
            id: investmentId,
            userId,
            ...UNPAID_MATURITY_CHOICE_CLAIM_WHERE,
          },
          data: {
            unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery,
            unpaidMaturityResolvedAt: now,
            recoveryEligibleAt: now,
            payoutUnlockedAt: null,
            payoutUnlockingInvestmentIds: [],
            payoutUnlockingUserIds: [],
            payoutReason: null,
            payabilityStatus: InvestmentPayabilityStatus.pending_liquidity,
            globalQueueRank: null,
            newSubscribersNeeded: null,
          },
        });
        if (claim.count !== 1) {
          throw new Error(UNPAID_MATURITY_CHOICE_CLAIM_FAILED);
        }

        return tx.investment.findFirstOrThrow({
          where: { id: investmentId },
        });
      });

      await notifyChoiceConfirmedEmail(userId, updated);
      return { ok: true, data: enrichAfterChoice(updated, fifoIds) };
    }

    const termDays = computeInvestmentTermDays(investment);
    const days = clampExtensionDays(termDays, extensionDays ?? NaN);
    if (days == null) {
      const bounds = extensionBounds(termDays);
      return {
        ok: false,
        status: 400,
        body: {
          msg: `extensionDays must be an integer between ${bounds.minDays} and ${bounds.maxDays}`,
          code: "invalid_extension_days",
          extensionMinDays: bounds.minDays,
          extensionMaxDays: bounds.maxDays,
        },
      };
    }

    const updated = await prisma.$transaction(async (tx) => {
      await consumePowerForInvestment(tx, {
        userId,
        userLevel,
        investmentId,
        powerType: choice,
        consumedAt: now,
      });

      const claim = await tx.investment.updateMany({
        where: {
          id: investmentId,
          userId,
          ...UNPAID_MATURITY_CHOICE_CLAIM_WHERE,
        },
        data: {
          unpaidMaturityResolution: UnpaidMaturityResolution.term_extension,
          unpaidMaturityResolvedAt: now,
          termExtensionDays: days,
          status: InvestmentStatus.active,
          payabilityStatus: InvestmentPayabilityStatus.not_matured,
          maturesAt: addDuration(now, `${days}D`),
          recoveryEligibleAt: null,
          unpaidMaturityChoiceDeadlineAt: null,
        },
      });
      if (claim.count !== 1) {
        throw new Error(UNPAID_MATURITY_CHOICE_CLAIM_FAILED);
      }

      return tx.investment.findFirstOrThrow({
        where: { id: investmentId },
      });
    });

    await notifyChoiceConfirmedEmail(userId, updated);
    return { ok: true, data: enrichAfterChoice(updated, fifoIds) };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === UNPAID_MATURITY_CHOICE_CLAIM_FAILED
    ) {
      return {
        ok: false,
        status: 409,
        body: {
          msg: "This investment is not eligible for an unpaid maturity choice",
          code: "not_eligible",
        },
      };
    }
    if (error instanceof PlayerPowerUnavailableError) {
      return {
        ok: false,
        status: 403,
        body: {
          msg: error.message,
          code: error.code,
          powerType: error.powerType,
        },
      };
    }
    throw error;
  }
}
