import { getInvestmentFunds } from "@/lib/config/investmentFunds";
import {
  defaultTypicalPayoutDays,
  loadTypicalPayoutDaysByFundIds,
} from "./typicalPayoutDays";

export async function getFundCatalog() {
  const funds = getInvestmentFunds();
  const fundIds = funds.map((fund) => fund.id);
  const typicalByFund = await loadTypicalPayoutDaysByFundIds(fundIds);

  return {
    funds: funds.map((fund) => ({
      ...fund,
      typicalPayoutDays:
        typicalByFund.get(fund.id) ?? defaultTypicalPayoutDays(fund.termDays),
    })),
  };
}
