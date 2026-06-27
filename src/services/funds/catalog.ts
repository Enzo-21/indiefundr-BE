import { INVESTMENT_FUNDS } from "@/lib/config/investmentFunds";
import {
  defaultTypicalPayoutDays,
  loadTypicalPayoutDaysByFundIds,
} from "./typicalPayoutDays";

export async function getFundCatalog() {
  const fundIds = INVESTMENT_FUNDS.map((fund) => fund.id);
  const typicalByFund = await loadTypicalPayoutDaysByFundIds(fundIds);

  return {
    funds: INVESTMENT_FUNDS.map((fund) => ({
      ...fund,
      typicalPayoutDays:
        typicalByFund.get(fund.id) ?? defaultTypicalPayoutDays(fund.termDays),
    })),
  };
}
