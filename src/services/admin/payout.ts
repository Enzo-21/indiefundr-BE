import {
  executeInvestmentPayout,
  executeSurplusInvestmentPayout,
} from "@/services/revenueEngine";

export async function payInvestmentNow(investmentId: string) {
  return executeInvestmentPayout(investmentId, "admin");
}

export async function payInvestmentWithSurplus(investmentId: string) {
  return executeSurplusInvestmentPayout(
    investmentId,
    "admin_surplus_liquidity"
  );
}
