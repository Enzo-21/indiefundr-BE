/**
 * Investment term length — configures `maturesAt` at subscribe.
 *
 * Payouts are manual (admin Pay now / surplus). `payoutEligibleAt` and `autoPayoutAt`
 * on investments are legacy fields and are not set from timing delays.
 *
 * ## Changing values
 *
 * - Edit `TESTNET_INVESTMENT_TERM` / `MAINNET_INVESTMENT_TERM` below (picked by
 *   `BLOCKCHAIN_NETWORK`), or set `INVESTMENT_TERM` env to override (duration syntax).
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

/** Investment term on Shasta / testnet → `maturesAt` at subscribe. */
export const TESTNET_INVESTMENT_TERM = "3D";

/** Investment term on Tron mainnet → `maturesAt` at subscribe. */
export const MAINNET_INVESTMENT_TERM = "90D";

function resolveDuration(
  envValue: string | undefined,
  fallback: string
): string {
  const trimmed = envValue?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function getDefaultInvestmentTerm(): string {
  return getEnv().blockchainNetwork === "mainnet"
    ? MAINNET_INVESTMENT_TERM
    : TESTNET_INVESTMENT_TERM;
}

export function getInvestmentTermSpec(): string {
  return resolveDuration(getEnv().investmentTerm, getDefaultInvestmentTerm());
}

/** Rounded day count for fund catalog / UI (see `durationToApproxDays`). */
export function getInvestmentTermApproxDays(): number {
  return durationToApproxDays(getInvestmentTermSpec());
}

/** e.g. `4 days`, `1 day`, `90 days` — for marketing and UI copy. */
export function formatInvestmentTermLabel(days?: number): string {
  const n = days ?? getInvestmentTermApproxDays();
  return `${n} day${n === 1 ? "" : "s"}`;
}

/** e.g. `4-day`, `90-day` — for compound adjectives in copy. */
export function formatInvestmentTermHyphenated(days?: number): string {
  const n = days ?? getInvestmentTermApproxDays();
  return `${n}-day`;
}

/** @deprecated Prefer `getInvestmentTermApproxDays()` — kept for imports that expect a number constant. */
export const INVESTMENT_TERM_DAYS = getInvestmentTermApproxDays();

export function getMaturityDate(fromDate: Date = new Date()): Date {
  return addDuration(fromDate, getInvestmentTermSpec());
}
