import { recalculateUserLevel } from "./playerLevelProgress";

/** Recompute earned level after investment/referral events; never throws to callers. */
export function scheduleUserLevelRecalculation(userId: string): void {
  void recalculateUserLevel(userId).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[playerLevels] recalculateUserLevel failed:", {
      userId,
      message,
    });
  });
}
