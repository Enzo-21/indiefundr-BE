/**
 * Investment term length — configures `maturesAt` at subscribe.
 *
 * Payouts are manual (admin Pay now / surplus). `payoutEligibleAt` and `autoPayoutAt`
 * on investments are legacy fields and are not set from timing delays.
 *
 * ## Changing values
 *
 * - Edit `DEFAULT_INVESTMENT_TERM` below, or set `INVESTMENT_TERM` env (duration syntax).
 * - Only **new** investments pick up a changed term; existing rows keep stored dates.
 *
 * ## Duration suffixes
 *
 * | Suffix | Unit    | Example |
 * |--------|---------|---------|
 * | D      | days    | 90D     |
 * | W      | weeks   | 2W      |
 * | H      | hours   | 12H     |
 * | Mi     | minutes | 30Mi    |
 * | Mo     | months  | 3Mo     |
 *
 * Do not use bare `M` (ambiguous between months and minutes).
 */
import { addDuration, durationToApproxDays } from "@/lib/duration/parseDuration";
import { getEnv } from "@/lib/env";

/** Default investment term → `maturesAt` at subscribe. */
export const DEFAULT_INVESTMENT_TERM = "90D";

function resolveDuration(
  envValue: string | undefined,
  fallback: string
): string {
  const trimmed = envValue?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function getInvestmentTermSpec(): string {
  return resolveDuration(getEnv().investmentTerm, DEFAULT_INVESTMENT_TERM);
}

/** Rounded day count for fund catalog / UI (see `durationToApproxDays`). */
export function getInvestmentTermApproxDays(): number {
  return durationToApproxDays(getInvestmentTermSpec());
}

/** @deprecated Prefer `getInvestmentTermApproxDays()` — kept for imports that expect a number constant. */
export const INVESTMENT_TERM_DAYS = getInvestmentTermApproxDays();

export function getMaturityDate(fromDate: Date = new Date()): Date {
  return addDuration(fromDate, getInvestmentTermSpec());
}
