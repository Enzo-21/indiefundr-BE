export const USDT_ARS_QUOTE_SNAPSHOT_ID = "current";
/** Treat quote as stale after 3 missed 5-minute crons. */
export const USDT_ARS_QUOTE_MAX_AGE_MS = 15 * 60 * 1000;

export function isUsdtArsQuoteFresh(
  fetchedAt: Date | null | undefined,
  now: Date = new Date(),
  maxAgeMs: number = USDT_ARS_QUOTE_MAX_AGE_MS
): boolean {
  if (!fetchedAt) return false;
  return now.getTime() - fetchedAt.getTime() <= maxAgeMs;
}
