/**
 * Marketplace waterfall simulation: 100_000 ARS tickets, app keeps 10% per
 * charge, remaining 90% FIFO-splits to earlier unpaid heads (Mercado Pago
 * Marketplace-style). First subscriber bootstraps platform float.
 *
 * Usage (from backend/):
 *   node --import tsx scripts/simulate-marketplace-waterfall-mp-ars.ts
 */
import {
  runMarketplaceWaterfallSimulation,
  writeMarketplaceWaterfallSimulationCsv,
  SIM_APP_FEE_PCT,
  SIM_WATERFALL_PRINCIPAL_ARS,
} from "../src/services/revenueEngine/marketplaceWaterfallSimulation";

const { path, summary } = writeMarketplaceWaterfallSimulationCsv();

console.log(
  JSON.stringify(
    {
      csv: path,
      assumptions: {
        ticketArs: SIM_WATERFALL_PRINCIPAL_ARS,
        perFund: 40,
        funds: 5,
        appFeePct: SIM_APP_FEE_PCT,
        model:
          "Marketplace waterfall: fee to app, net FIFO to earlier unpaid heads; first ticket → platform float",
        note: "Illustrative cashflow only — not legal/tax advice.",
      },
      summary,
      smoke: runMarketplaceWaterfallSimulation({ perFund: 1, seed: 1 }).summary,
    },
    null,
    2
  )
);
