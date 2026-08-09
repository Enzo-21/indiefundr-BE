import { InvestmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  consumePowerForInvestment,
  getPowerInventory,
  PlayerPowerUnavailableError,
} from "@/services/playerPowers/playerPowers";
import {
  boostExpiresAt,
  canActivateBoostGivenMaturesAt,
  getBoostInviteesRequired,
  REFERRAL_BOOST_WINDOW_DAYS,
} from "@/lib/config/referralBoost";

export class BoostActivationError extends Error {
  readonly code:
    | "not_found"
    | "forbidden"
    | "invalid_status"
    | "already_boosted"
    | "power_unavailable"
    | "too_close_to_maturity";

  constructor(
    code: BoostActivationError["code"],
    message: string
  ) {
    super(message);
    this.name = "BoostActivationError";
    this.code = code;
  }
}

export type ActivateBoostResult = {
  investmentId: string;
  boostActivatedAt: string;
  boostExpiresAt: string;
  maturesAt: string;
  requiredCount: number;
  projectedPayoutUsdt: number;
};

export async function activateBoostForInvestment(
  userId: string,
  investmentId: string
): Promise<ActivateBoostResult> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    include: { user: { select: { level: true } } },
  });

  if (!investment) {
    throw new BoostActivationError("not_found", "Investment not found");
  }
  if (investment.userId !== userId) {
    throw new BoostActivationError("forbidden", "Not your investment");
  }
  if (investment.status !== InvestmentStatus.active) {
    throw new BoostActivationError(
      "invalid_status",
      "Boost can only be used on an active investment"
    );
  }
  if (investment.boostActivatedAt || investment.boostCompletedAt) {
    throw new BoostActivationError(
      "already_boosted",
      "Boost was already used on this investment"
    );
  }
  if (investment.payoutUnlockedAt) {
    throw new BoostActivationError(
      "invalid_status",
      "Investment is already unlocked for payout"
    );
  }

  const now = new Date();
  if (!canActivateBoostGivenMaturesAt(investment.maturesAt, now)) {
    throw new BoostActivationError(
      "too_close_to_maturity",
      `Boost requires at least ${REFERRAL_BOOST_WINDOW_DAYS()} days remaining until maturity`
    );
  }

  const userLevel = investment.user.level;
  const inventory = await getPowerInventory(userId, userLevel);
  if (inventory.boost.available <= 0) {
    throw new BoostActivationError(
      "power_unavailable",
      "No Boost power cards available"
    );
  }

  const expiresAt = boostExpiresAt(now);

  try {
    await prisma.$transaction(async (tx) => {
      await consumePowerForInvestment(tx, {
        userId,
        userLevel,
        investmentId,
        powerType: "boost",
        consumedAt: now,
      });

      await tx.investment.update({
        where: { id: investmentId },
        data: {
          boostActivatedAt: now,
          maturesAt: expiresAt,
        },
      });

      await tx.referralBoostLink.create({
        data: {
          investmentId,
          inviterUserId: userId,
          inviteIds: [],
        },
      });
    });
  } catch (err) {
    if (err instanceof PlayerPowerUnavailableError) {
      throw new BoostActivationError("power_unavailable", err.message);
    }
    throw err;
  }

  return {
    investmentId,
    boostActivatedAt: now.toISOString(),
    boostExpiresAt: expiresAt.toISOString(),
    maturesAt: expiresAt.toISOString(),
    requiredCount: getBoostInviteesRequired(investment.amountUsdt),
    projectedPayoutUsdt: investment.projectedPayoutUsdt,
  };
}
