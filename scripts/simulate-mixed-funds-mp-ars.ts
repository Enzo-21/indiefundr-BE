/**
 * Mixed-funds simulation at fixed 100_000 ARS ticket via Mercado Pago.
 * 3 unlockers; platform absorbs MP inbound fee + estimated taxes;
 * user absorbs MP fee on receiving payout.
 *
 * Usage (from backend/):
 *   node --import tsx scripts/simulate-mixed-funds-mp-ars.ts
 */
import {
  runMixedFundsMpArsSimulation,
  writeMixedFundsMpArsSimulationCsv,
  SIM_GANANCIAS_PCT,
  SIM_IIBB_PCT,
  SIM_MP_IN_FEE_PCT,
  SIM_MP_OUT_FEE_PCT,
  SIM_PRINCIPAL_ARS,
  SIM_UNLOCKERS_REQUIRED,
} from "../src/services/revenueEngine/mixedFundsMpArsSimulation";

const { path, summary } = writeMixedFundsMpArsSimulationCsv();

console.log(
  JSON.stringify(
    {
      csv: path,
      assumptions: {
        ticketArs: SIM_PRINCIPAL_ARS,
        perFund: 40,
        funds: 5,
        unlockersRequired: SIM_UNLOCKERS_REQUIRED,
        cohortLegs: SIM_UNLOCKERS_REQUIRED + 1,
        mpInFeePctPlatformAbsorbs: SIM_MP_IN_FEE_PCT,
        mpOutFeePctUserAbsorbs: SIM_MP_OUT_FEE_PCT,
        iibbPctEstimate: SIM_IIBB_PCT,
        gananciasPctEstimateOnSurplusSlice: SIM_GANANCIAS_PCT,
        note: "Tax rates are illustrative estimates for simulation only — not tax advice.",
      },
      summary,
      smoke: runMixedFundsMpArsSimulation({
        perFund: 2,
        seed: 1,
      }).summary,
    },
    null,
    2
  )
);
