import { InvestmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  consumePowerForInvestment,
  getPowerInventory,
  PlayerPowerUnavailableError,
} from "@/services/playerPowers/playerPowers";
import { getBoostInviteesRequired } from "@/lib/config/referralBoost";
import { boostExpiresAt } from "@/lib/config/referralBoost";

export class BoostActivationError extends Error {
  readonly code:
    | "not_found"
    | "forbidden"
    | "invalid_status"
    | "already_boosted"
    | "power_unavailable";

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

  const userLevel = investment.user.level;
  const inventory = await getPowerInventory(userId, userLevel);
  if (inventory.boost.available <= 0) {
    throw new BoostActivationError(
      "power_unavailable",
      "No Boost power cards available"
    );
  }

  const now = new Date();

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
        data: { boostActivatedAt: now },
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
    boostExpiresAt: boostExpiresAt(now).toISOString(),
    requiredCount: getBoostInviteesRequired(investment.amountUsdt),
    projectedPayoutUsdt: investment.projectedPayoutUsdt,
  };
}
