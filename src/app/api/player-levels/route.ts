import { withAuth } from "@/lib/http/withAuth";
import {
  normalizePlayerLevel,
  PLAYER_LEVELS,
} from "@/lib/config/playerLevels";
import { getTotalInvestmentUsage } from "@/lib/config/investmentSlots";
import { prisma } from "@/lib/prisma";
import { recalculateUserLevel } from "@/services/playerLevels/playerLevelProgress";
import {
  getPowerInventory,
  serializePowerCards,
} from "@/services/playerPowers/playerPowers";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const levelResult = await recalculateUserLevel(authUser.id);
    const currentLevel = levelResult.newLevel;
    const totalUsage = await getTotalInvestmentUsage(
      authUser.id,
      prisma,
      currentLevel
    );
    const inventory = await getPowerInventory(authUser.id, currentLevel);

    return Response.json({
      currentLevel,
      levels: PLAYER_LEVELS,
      powers: serializePowerCards(inventory),
      totalOpenCount: totalUsage.totalOpenCount,
      maxTotalOpenInvestments: totalUsage.maxTotalOpenInvestments,
      totalSlotsAvailable: totalUsage.totalSlotsAvailable,
      levelProgress: {
        earnedLevel: currentLevel,
        changed: levelResult.changed,
        stats: levelResult.stats,
      },
    });
  });
}
