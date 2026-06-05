import { getEnv } from "@/lib/env";

export { getFundById, isValidFundId, INVESTMENT_FUNDS } from "./investmentFunds";
export type { InvestmentFund } from "./investmentFunds";
export {
  getMaturityDate,
  getInvestmentTermApproxDays,
  INVESTMENT_TERM_DAYS,
} from "./investmentTiming";

export function getInvestmentAmountUsdt(): number {
  return getEnv().investmentAmountUsdt;
}

export function isValidInvestmentAmount(amount: number): boolean {
  return amount === getInvestmentAmountUsdt();
}

export function projectedPayoutUsdt(
  amountUsdt: number,
  returnPercent90d: number
): number {
  return parseFloat((amountUsdt * (1 + returnPercent90d / 100)).toFixed(4));
}
