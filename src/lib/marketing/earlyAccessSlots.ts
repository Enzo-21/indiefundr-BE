/** Early-access marketing counter (copy only — not tied to real capacity). */

export const EARLY_ACCESS_TOTAL_CUSTOMERS = 8000;

/** Remaining slots on the campaign anchor day (UTC). */
export const EARLY_ACCESS_ANCHOR_REMAINING = 174;

/** UTC calendar date when remaining = EARLY_ACCESS_ANCHOR_REMAINING. */
export const EARLY_ACCESS_ANCHOR_UTC = { year: 2026, month: 8, day: 4 } as const;

export const EARLY_ACCESS_DAILY_DECREASE = 2;

function utcDayNumber(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * Remaining early-access slots for a given instant.
 * Starts at 174 on 2026-08-04 UTC, decreases by 2 per calendar day, floored at 0.
 */
export function getEarlyAccessSlotsRemaining(now: Date = new Date()): number {
  const nowDay = utcDayNumber(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate()
  );
  const anchorDay = utcDayNumber(
    EARLY_ACCESS_ANCHOR_UTC.year,
    EARLY_ACCESS_ANCHOR_UTC.month,
    EARLY_ACCESS_ANCHOR_UTC.day
  );
  const daysSince = Math.max(0, nowDay - anchorDay);
  return Math.max(
    0,
    EARLY_ACCESS_ANCHOR_REMAINING - EARLY_ACCESS_DAILY_DECREASE * daysSince
  );
}
