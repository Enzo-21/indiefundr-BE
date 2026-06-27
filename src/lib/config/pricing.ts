import { normalizePlayerLevel } from "@/lib/config/playerLevels";

export { getFundById, isValidFundId, INVESTMENT_FUNDS } from "./investmentFunds";
export type { InvestmentFund } from "./investmentFunds";
export {
  getMaturityDate,
  getInvestmentTermApproxDays,
  INVESTMENT_TERM_DAYS,
} from "./investmentTiming";

/** Base tier amount (levels 0–1). */
export const BASE_INVESTMENT_AMOUNT_USDT = 25;

/** USDT principal required for a new subscription at the given player level. */
export function getInvestmentAmountUsdtForLevel(level: number): number {
  const l = normalizePlayerLevel(level);
  if (l <= 1) return 25;
  if (l === 2) return 50;
  if (l <= 4) return 75;
  return 100;
}

export function isValidInvestmentAmount(
  amount: number,
  level: number
): boolean {
  return amount === getInvestmentAmountUsdtForLevel(level);
}

export function projectedPayoutUsdt(
  amountUsdt: number,
  returnPercent90d: number
): number {
  return parseFloat((amountUsdt * (1 + returnPercent90d / 100)).toFixed(4));
}
