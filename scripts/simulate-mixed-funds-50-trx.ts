/**
 * Mixed-funds simulation at fixed 50 USDT ticket + TRX network costs.
 *
 * Usage (from backend/):
 *   node --import tsx scripts/simulate-mixed-funds-50-trx.ts
 */
import {
  runMixedFunds50TrxSimulation,
  writeMixedFunds50TrxSimulationCsv,
  SIM_TRX_PER_TRANSFER,
  SIM_TRX_PRICE_USD,
} from "../src/services/revenueEngine/mixedFunds50TrxSimulation";

const { path, summary } = writeMixedFunds50TrxSimulationCsv();
const withWithdraw = summary;
const noWithdraw = runMixedFunds50TrxSimulation({
  includeWithdrawals: false,
  seed: 50,
}).summary;

console.log(
  JSON.stringify(
    {
      csv: path,
      assumptions: {
        ticketUsdt: withWithdraw.principalUsdt,
        perFund: 40,
        funds: 5,
        trxPerTransfer: SIM_TRX_PER_TRANSFER,
        trxPriceUsd: SIM_TRX_PRICE_USD,
        includeWithdrawals: true,
      },
      withWithdrawals: withWithdraw,
      investAndPayoutOnly: noWithdraw,
    },
    null,
    2
  )
);
