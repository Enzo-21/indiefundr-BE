import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { protectedRevenueForAmount } from "@/lib/config/investmentCohort";
import {
  ledgerProtectedWithdrawable,
  ledgerTruncateUsdt,
} from "@/lib/money/formatUsdt";
import type { SimulatedInvestment } from "./triadSimulation";
import {
  buildMixedFundQueue,
  projectedPayoutForFund,
  SIM_FUNDS,
  type SimFundKey,
} from "./mixedFunds50TrxSimulation";

/** Ticket fijo por inversión (ARS). */
export const SIM_PRINCIPAL_ARS = 100_000;

/** Unlock: 3 inversores posteriores (cohorte de 4 piernas). */
export const SIM_UNLOCKERS_REQUIRED = 3;

/** Comisión Mercado Pago al cobrar (ingreso). La absorbe la plataforma. */
export const SIM_MP_IN_FEE_PCT = 6;

/**
 * Comisión Mercado Pago al recibir el payout (egreso hacia el usuario).
 * La absorbe la cuenta MP del usuario — no sale de la caja de la plataforma.
 */
export const SIM_MP_OUT_FEE_PCT = 6;

/**
 * Ingresos Brutos estimado sobre el bruto cobrado por suscripción.
 * Ilustrativo (varía por jurisdicción / convenio); no es asesoramiento fiscal.
 */
export const SIM_IIBB_PCT = 3.5;

/**
 * Ganancias estimado sobre el surplus de cohorte reconocido al suscribir.
 * Ilustrativo (alícuota societaria simplificada ~25%); no es asesoramiento fiscal.
 */
export const SIM_GANANCIAS_PCT = 25;

export type MpArsSimInvestment = SimulatedInvestment & {
  fund: SimFundKey;
  returnPercent: number;
  label: string;
  paid: boolean;
  payVia: "cohort" | "surplus" | null;
};

export type MpArsSimEvent = {
  step: number;
  event: "subscription" | "payout" | "surplus_payout";
  fund: SimFundKey;
  returnPercent: number;
  label: string;
  amountArs: number;
  poolAvailable: number;
  treasurySurplus: number;
  protectedWithdrawable: number;
  mpFeeInCumulative: number;
  mpFeeOutUserCumulative: number;
  iibbCumulative: number;
  gananciasCumulative: number;
  platformCostCumulative: number;
  notes: string;
};

export type MpArsSimSummary = {
  investmentCount: number;
  principalArs: number;
  unlockersRequired: number;
  cohortLegs: number;
  grossSubscribed: number;
  netReceivedAfterMpIn: number;
  cohortPayouts: number;
  surplusPayouts: number;
  totalPayoutArs: number;
  unpaidCount: number;
  unpaidPayoutObligationArs: number;
  poolAvailable: number;
  treasurySurplus: number;
  protectedWithdrawable: number;
  protectedRevenueCredited: number;
  mpFeeInTotal: number;
  mpFeeOutUserTotal: number;
  iibbTotal: number;
  gananciasTotal: number;
  platformCostTotal: number;
  /** Protected − MP in − IIBB − Ganancias (margen de plataforma tras costos estimados). */
  platformMarginAfterMpAndTaxArs: number;
  /** Pool + surplus − unpaid − MP in − IIBB − Ganancias. */
  residualAfterObligationsAndCostsArs: number;
};

function roundArs(value: number): number {
  return ledgerTruncateUsdt(value);
}

function feePct(amount: number, pct: number): number {
  return roundArs(amount * (pct / 100));
}

/** Surplus de cohorte homogénea con N unlockers (legs = unlockers + 1). */
export function cohortSurplusForPayout(
  payoutAmountArs: number,
  principalPerLegArs: number,
  unlockersRequired = SIM_UNLOCKERS_REQUIRED
): number {
  const legs = unlockersRequired + 1;
  const grossInflow = roundArs(legs * principalPerLegArs);
  const protectedTotal = roundArs(
    legs * protectedRevenueForAmount(principalPerLegArs)
  );
  return roundArs(
    Math.max(0, grossInflow - protectedTotal - payoutAmountArs)
  );
}

export function surplusPerSubscriptionArs(
  projectedPayoutArs: number,
  amountArs: number,
  unlockersRequired = SIM_UNLOCKERS_REQUIRED
): number {
  const legs = unlockersRequired + 1;
  return roundArs(
    cohortSurplusForPayout(
      projectedPayoutArs,
      amountArs,
      unlockersRequired
    ) / legs
  );
}

type UnlockCandidate = Pick<
  SimulatedInvestment,
  "id" | "userId" | "subscribedAt" | "amountUsdt" | "excludedFromTriadUnlock"
>;

/** Igual que findUnlockingInvestments pero con principal requerido = unlockers × head. */
export function findUnlockingInvestmentsN<T extends UnlockCandidate>(
  candidate: UnlockCandidate,
  investments: T[],
  consumedUnlockingInvestmentIds: ReadonlySet<string> = new Set(),
  unlockersRequired = SIM_UNLOCKERS_REQUIRED
): T[] {
  if (!candidate.subscribedAt) return [];

  const headAmount = candidate.amountUsdt > 0 ? candidate.amountUsdt : SIM_PRINCIPAL_ARS;
  const requiredPrincipal = roundArs(unlockersRequired * headAmount);
  let receivedPrincipal = 0;
  const selected: T[] = [];

  for (const investment of investments) {
    if (!investment.subscribedAt) continue;
    if (investment.id === candidate.id) continue;
    if (consumedUnlockingInvestmentIds.has(investment.id)) continue;
    if (investment.subscribedAt <= candidate.subscribedAt) continue;
    if (investment.excludedFromTriadUnlock) continue;

    const unlockerAmount =
      investment.amountUsdt > 0 ? investment.amountUsdt : SIM_PRINCIPAL_ARS;
    selected.push(investment);
    receivedPrincipal += unlockerAmount;
    if (receivedPrincipal >= requiredPrincipal) {
      break;
    }
  }

  return receivedPrincipal >= requiredPrincipal ? selected : [];
}

/**
 * Mixed-funds ledger en ARS con Mercado Pago + 3 unlockers + impuestos estimados.
 *
 * - Suscripción: pool += 100k; plataforma absorbe MP in + IIBB; Ganancias sobre surplus slice.
 * - Payout: pool − payout; MP out lo absorbe el usuario (solo informativo en CSV).
 */
export function runMixedFundsMpArsSimulation(options: {
  perFund?: number;
  principalArs?: number;
  seed?: number;
  unlockersRequired?: number;
  mpInFeePct?: number;
  mpOutFeePct?: number;
  iibbPct?: number;
  gananciasPct?: number;
} = {}): {
  events: MpArsSimEvent[];
  summary: MpArsSimSummary;
  investments: MpArsSimInvestment[];
} {
  const principalArs = options.principalArs ?? SIM_PRINCIPAL_ARS;
  const unlockersRequired =
    options.unlockersRequired ?? SIM_UNLOCKERS_REQUIRED;
  const mpInPct = options.mpInFeePct ?? SIM_MP_IN_FEE_PCT;
  const mpOutPct = options.mpOutFeePct ?? SIM_MP_OUT_FEE_PCT;
  const iibbPct = options.iibbPct ?? SIM_IIBB_PCT;
  const gananciasPct = options.gananciasPct ?? SIM_GANANCIAS_PCT;

  const queue = buildMixedFundQueue({
    perFund: options.perFund,
    principalUsdt: principalArs,
    seed: options.seed ?? 100_000,
  });

  const investments: MpArsSimInvestment[] = [];
  const events: MpArsSimEvent[] = [];
  let poolAvailable = 0;
  let treasurySurplus = 0;
  let step = 0;
  let mpFeeInCumulative = 0;
  let mpFeeOutUserCumulative = 0;
  let iibbCumulative = 0;
  let gananciasCumulative = 0;
  let cohortPayouts = 0;
  let surplusPayoutCount = 0;
  const consumedUnlockingInvestmentIds = new Set<string>();

  const platformCostCumulative = () =>
    roundArs(mpFeeInCumulative + iibbCumulative + gananciasCumulative);

  const pushEvent = (
    event: MpArsSimEvent["event"],
    inv: MpArsSimInvestment,
    amountArs: number,
    notes: string
  ) => {
    step += 1;
    events.push({
      step,
      event,
      fund: inv.fund,
      returnPercent: inv.returnPercent,
      label: inv.label,
      amountArs,
      poolAvailable,
      treasurySurplus,
      protectedWithdrawable: ledgerProtectedWithdrawable(
        poolAvailable,
        treasurySurplus
      ),
      mpFeeInCumulative,
      mpFeeOutUserCumulative,
      iibbCumulative,
      gananciasCumulative,
      platformCostCumulative: platformCostCumulative(),
      notes,
    });
  };

  const trySurplusPays = () => {
    const unpaid = investments
      .filter((inv) => !inv.paid)
      .sort((a, b) => a.subscribedAt.getTime() - b.subscribedAt.getTime());
    for (const inv of unpaid) {
      if (treasurySurplus + 1e-9 < inv.projectedPayoutUsdt) continue;
      poolAvailable = roundArs(
        Math.max(0, poolAvailable - inv.projectedPayoutUsdt)
      );
      treasurySurplus = roundArs(
        Math.max(0, treasurySurplus - inv.projectedPayoutUsdt)
      );
      inv.paid = true;
      inv.payVia = "surplus";
      surplusPayoutCount += 1;
      const userMpOut = feePct(inv.projectedPayoutUsdt, mpOutPct);
      mpFeeOutUserCumulative = roundArs(mpFeeOutUserCumulative + userMpOut);
      pushEvent(
        "surplus_payout",
        inv,
        inv.projectedPayoutUsdt,
        `Surplus ≥ ${inv.projectedPayoutUsdt}; pool and surplus −${inv.projectedPayoutUsdt}; user MP out ~${userMpOut} ARS (${mpOutPct}%, absorbed by user)`
      );
    }
  };

  const tryCohortPays = () => {
    const ordered = [...investments].sort(
      (a, b) => a.subscribedAt.getTime() - b.subscribedAt.getTime()
    );
    for (const candidate of ordered) {
      if (candidate.paid) continue;
      const unlockers = findUnlockingInvestmentsN(
        candidate,
        ordered,
        consumedUnlockingInvestmentIds,
        unlockersRequired
      );
      if (unlockers.length === 0) continue;

      for (const unlocker of unlockers) {
        consumedUnlockingInvestmentIds.add(unlocker.id);
      }

      poolAvailable = roundArs(
        Math.max(0, poolAvailable - candidate.projectedPayoutUsdt)
      );
      candidate.paid = true;
      candidate.payVia = "cohort";
      cohortPayouts += 1;
      const userMpOut = feePct(candidate.projectedPayoutUsdt, mpOutPct);
      mpFeeOutUserCumulative = roundArs(mpFeeOutUserCumulative + userMpOut);
      const unlockerLabels = unlockers
        .map((u) => {
          const inv = investments.find((i) => i.id === u.id);
          return inv?.label ?? u.id;
        })
        .join(", ");
      pushEvent(
        "payout",
        candidate,
        candidate.projectedPayoutUsdt,
        `Cohort payout ${candidate.projectedPayoutUsdt} ARS (${candidate.returnPercent}%); unlocked by ${unlockerLabels} (${unlockersRequired} unlockers); user MP out ~${userMpOut} ARS (${mpOutPct}%, absorbed by user)`
      );
    }
  };

  const startMs = Date.UTC(2026, 0, 1);
  queue.forEach((row, idx) => {
    const inv: MpArsSimInvestment = {
      id: `inv-${idx + 1}`,
      userId: `user-${idx + 1}`,
      subscribedAt: new Date(startMs + idx * 60_000),
      amountUsdt: row.amountUsdt,
      projectedPayoutUsdt: row.projectedPayoutUsdt,
      excludedFromTriadUnlock: false,
      fund: row.fund,
      returnPercent: row.returnPercent,
      label: row.label,
      paid: false,
      payVia: null,
    };
    investments.push(inv);

    poolAvailable = roundArs(poolAvailable + principalArs);
    const surplusSlice = surplusPerSubscriptionArs(
      inv.projectedPayoutUsdt,
      principalArs,
      unlockersRequired
    );
    treasurySurplus = roundArs(treasurySurplus + surplusSlice);

    const mpIn = feePct(principalArs, mpInPct);
    const iibb = feePct(principalArs, iibbPct);
    const ganancias = feePct(surplusSlice, gananciasPct);
    mpFeeInCumulative = roundArs(mpFeeInCumulative + mpIn);
    iibbCumulative = roundArs(iibbCumulative + iibb);
    gananciasCumulative = roundArs(gananciasCumulative + ganancias);

    pushEvent(
      "subscription",
      inv,
      principalArs,
      `+${surplusSlice} surplus on subscribe (${inv.fund}, ${unlockersRequired}+1 cohort); platform MP in ${mpIn} ARS (${mpInPct}%); IIBB est. ${iibb} ARS (${iibbPct}%); Ganancias est. ${ganancias} ARS (${gananciasPct}% of surplus slice)`
    );

    trySurplusPays();
    tryCohortPays();
  });

  const unpaid = investments.filter((inv) => !inv.paid);
  const unpaidPayoutObligationArs = roundArs(
    unpaid.reduce((sum, inv) => sum + inv.projectedPayoutUsdt, 0)
  );
  const protectedRevenueCredited = roundArs(
    investments.length * protectedRevenueForAmount(principalArs)
  );
  const totalPayoutArs = roundArs(
    investments
      .filter((inv) => inv.paid)
      .reduce((sum, inv) => sum + inv.projectedPayoutUsdt, 0)
  );
  const platformCostTotal = platformCostCumulative();
  const grossSubscribed = roundArs(investments.length * principalArs);
  const netReceivedAfterMpIn = roundArs(grossSubscribed - mpFeeInCumulative);

  const summary: MpArsSimSummary = {
    investmentCount: investments.length,
    principalArs,
    unlockersRequired,
    cohortLegs: unlockersRequired + 1,
    grossSubscribed,
    netReceivedAfterMpIn,
    cohortPayouts,
    surplusPayouts: surplusPayoutCount,
    totalPayoutArs,
    unpaidCount: unpaid.length,
    unpaidPayoutObligationArs,
    poolAvailable,
    treasurySurplus,
    protectedWithdrawable: ledgerProtectedWithdrawable(
      poolAvailable,
      treasurySurplus
    ),
    protectedRevenueCredited,
    mpFeeInTotal: mpFeeInCumulative,
    mpFeeOutUserTotal: mpFeeOutUserCumulative,
    iibbTotal: iibbCumulative,
    gananciasTotal: gananciasCumulative,
    platformCostTotal,
    platformMarginAfterMpAndTaxArs: roundArs(
      protectedRevenueCredited - platformCostTotal
    ),
    residualAfterObligationsAndCostsArs: roundArs(
      poolAvailable +
        treasurySurplus -
        unpaidPayoutObligationArs -
        platformCostTotal
    ),
  };

  return { events, summary, investments };
}

export function mpArsSimEventsToCsv(events: MpArsSimEvent[]): string {
  const header = [
    "step",
    "event",
    "fund",
    "return_percent",
    "label",
    "amount_ars",
    "pool_available",
    "treasury_surplus",
    "protected_withdrawable",
    "mp_fee_in_cumulative",
    "mp_fee_out_user_cumulative",
    "iibb_cumulative",
    "ganancias_cumulative",
    "platform_cost_cumulative",
    "notes",
  ].join(",");
  const lines = events.map((e) =>
    [
      e.step,
      e.event,
      e.fund,
      e.returnPercent,
      e.label,
      e.amountArs,
      e.poolAvailable.toFixed(2),
      e.treasurySurplus.toFixed(2),
      e.protectedWithdrawable.toFixed(2),
      e.mpFeeInCumulative.toFixed(2),
      e.mpFeeOutUserCumulative.toFixed(2),
      e.iibbCumulative.toFixed(2),
      e.gananciasCumulative.toFixed(2),
      e.platformCostCumulative.toFixed(2),
      `"${e.notes.replace(/"/g, '""')}"`,
    ].join(",")
  );
  return [header, ...lines].join("\n") + "\n";
}

export function writeMixedFundsMpArsSimulationCsv(
  outRelativePath = "specs/revenue-engine/simulations/mixed-funds-200-ticket100k-mp-ars-simulation.csv"
): { path: string; summary: MpArsSimSummary } {
  const { events, summary } = runMixedFundsMpArsSimulation({
    perFund: 40,
    principalArs: SIM_PRINCIPAL_ARS,
    seed: 100_000,
    unlockersRequired: SIM_UNLOCKERS_REQUIRED,
  });
  const path = join(process.cwd(), outRelativePath);
  writeFileSync(path, mpArsSimEventsToCsv(events), "utf8");
  return { path, summary };
}

export { projectedPayoutForFund, SIM_FUNDS };
