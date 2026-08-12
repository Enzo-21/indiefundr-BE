import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  protectedRevenueForAmount,
  surplusPerSubscription,
} from "@/lib/config/investmentCohort";
import { ledgerProtectedWithdrawable, ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { findUnlockingInvestments } from "./payoutScheduler";
import type { SimulatedInvestment } from "./triadSimulation";

/** All users stay at base ticket (level 0–1). */
export const SIM_PRINCIPAL_USDT = 50;

/** Net TRX burned per USDT transfer after sponsorship sweep (ops average). */
export const SIM_TRX_PER_TRANSFER = 10;

/** Assumed TRX/USD for converting network costs. */
export const SIM_TRX_PRICE_USD = 0.25;

export const SIM_FUNDS = [
  { key: "Aggressive Alpha", returnPercent: 40 },
  { key: "Growth Partners", returnPercent: 25 },
  { key: "Balanced Growth", returnPercent: 15 },
  { key: "Stable Yield", returnPercent: 10 },
  { key: "Capital Shield", returnPercent: 6 },
] as const;

export type SimFundKey = (typeof SIM_FUNDS)[number]["key"];

export type MixedSimInvestment = SimulatedInvestment & {
  fund: SimFundKey;
  returnPercent: number;
  label: string;
  paid: boolean;
  payVia: "triad" | "surplus" | null;
};

export type MixedSimEvent = {
  step: number;
  event: "subscription" | "payout" | "surplus_payout";
  fund: SimFundKey;
  returnPercent: number;
  label: string;
  amountUsdt: number;
  poolAvailable: number;
  treasurySurplus: number;
  protectedWithdrawable: number;
  trxBurnedCumulative: number;
  trxCostUsdtCumulative: number;
  notes: string;
};

export type MixedSimSummary = {
  investmentCount: number;
  principalUsdt: number;
  grossSubscribed: number;
  triadPayouts: number;
  surplusPayouts: number;
  totalPayoutUsdt: number;
  unpaidCount: number;
  unpaidPayoutObligationUsdt: number;
  poolAvailable: number;
  treasurySurplus: number;
  protectedWithdrawable: number;
  protectedRevenueCredited: number;
  /** invest + payout + withdraw (paid users only) */
  trxTransfers: number;
  trxBurned: number;
  trxCostUsdt: number;
  /** Protected credited − TRX network cost (does not reserve unpaid heads). */
  platformMarginAfterTrxUsdt: number;
  /** Pool + surplus − unpaid obligations − TRX (rough solvency after fees). */
  residualAfterObligationsAndTrxUsdt: number;
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

export function projectedPayoutForFund(
  principalUsdt: number,
  returnPercent: number
): number {
  return ledgerTruncateUsdt(principalUsdt * (1 + returnPercent / 100));
}

export function buildMixedFundQueue(options: {
  perFund?: number;
  principalUsdt?: number;
  seed?: number;
}): Array<{ fund: SimFundKey; returnPercent: number; label: string; amountUsdt: number; projectedPayoutUsdt: number }> {
  const perFund = options.perFund ?? 40;
  const principalUsdt = options.principalUsdt ?? SIM_PRINCIPAL_USDT;
  const rand = mulberry32(options.seed ?? 50);
  const queue: Array<{
    fund: SimFundKey;
    returnPercent: number;
    label: string;
    amountUsdt: number;
    projectedPayoutUsdt: number;
  }> = [];

  let n = 0;
  for (const fund of SIM_FUNDS) {
    for (let i = 0; i < perFund; i++) {
      n += 1;
      queue.push({
        fund: fund.key,
        returnPercent: fund.returnPercent,
        label: `Investment${n}`,
        amountUsdt: principalUsdt,
        projectedPayoutUsdt: projectedPayoutForFund(
          principalUsdt,
          fund.returnPercent
        ),
      });
    }
  }
  // Labels were assigned before shuffle; renumber after shuffle for chronological Investment#
  shuffleInPlace(queue, rand);
  return queue.map((row, idx) => ({
    ...row,
    label: `Investment${idx + 1}`,
  }));
}

function trxToUsdt(trx: number, price = SIM_TRX_PRICE_USD): number {
  return ledgerTruncateUsdt(trx * price);
}

/**
 * Mixed-funds ledger simulation at fixed base ticket, with TRX network costs:
 * - +1 transfer on each subscription (user → treasury)
 * - +1 transfer on each payout / surplus_payout (treasury → user)
 * - +1 transfer when that user withdraws the credited payout
 */
export function runMixedFunds50TrxSimulation(options: {
  perFund?: number;
  principalUsdt?: number;
  seed?: number;
  trxPerTransfer?: number;
  trxPriceUsd?: number;
  /** When true, count a withdraw TRX burn for every paid head. */
  includeWithdrawals?: boolean;
} = {}): { events: MixedSimEvent[]; summary: MixedSimSummary; investments: MixedSimInvestment[] } {
  const principalUsdt = options.principalUsdt ?? SIM_PRINCIPAL_USDT;
  const trxPer = options.trxPerTransfer ?? SIM_TRX_PER_TRANSFER;
  const trxPrice = options.trxPriceUsd ?? SIM_TRX_PRICE_USD;
  const includeWithdrawals = options.includeWithdrawals !== false;

  const queue = buildMixedFundQueue({
    perFund: options.perFund,
    principalUsdt,
    seed: options.seed,
  });

  const investments: MixedSimInvestment[] = [];
  const events: MixedSimEvent[] = [];
  let poolAvailable = 0;
  let treasurySurplus = 0;
  let step = 0;
  let trxBurned = 0;
  let triadPayouts = 0;
  let surplusPayoutCount = 0;
  const consumedUnlockingInvestmentIds = new Set<string>();

  const pushEvent = (
    event: MixedSimEvent["event"],
    inv: MixedSimInvestment,
    amountUsdt: number,
    notes: string
  ) => {
    step += 1;
    events.push({
      step,
      event,
      fund: inv.fund,
      returnPercent: inv.returnPercent,
      label: inv.label,
      amountUsdt,
      poolAvailable,
      treasurySurplus,
      protectedWithdrawable: ledgerProtectedWithdrawable(
        poolAvailable,
        treasurySurplus
      ),
      trxBurnedCumulative: trxBurned,
      trxCostUsdtCumulative: trxToUsdt(trxBurned, trxPrice),
      notes,
    });
  };

  const trySurplusPays = () => {
    const unpaid = investments
      .filter((inv) => !inv.paid)
      .sort((a, b) => a.subscribedAt.getTime() - b.subscribedAt.getTime());
    for (const inv of unpaid) {
      if (treasurySurplus + 1e-9 < inv.projectedPayoutUsdt) continue;
      poolAvailable = ledgerTruncateUsdt(
        Math.max(0, poolAvailable - inv.projectedPayoutUsdt)
      );
      treasurySurplus = ledgerTruncateUsdt(
        Math.max(0, treasurySurplus - inv.projectedPayoutUsdt)
      );
      inv.paid = true;
      inv.payVia = "surplus";
      surplusPayoutCount += 1;
      trxBurned += trxPer; // treasury → user
      if (includeWithdrawals) trxBurned += trxPer; // user withdraw
      pushEvent(
        "surplus_payout",
        inv,
        inv.projectedPayoutUsdt,
        `Surplus ≥ ${inv.projectedPayoutUsdt}; pool and surplus −${inv.projectedPayoutUsdt}; +${includeWithdrawals ? 2 : 1}×${trxPer} TRX (payout${includeWithdrawals ? "+withdraw" : ""})`
      );
    }
  };

  const tryTriadPays = () => {
    const ordered = [...investments].sort(
      (a, b) => a.subscribedAt.getTime() - b.subscribedAt.getTime()
    );
    for (const candidate of ordered) {
      if (candidate.paid) continue;
      const unlockers = findUnlockingInvestments(
        candidate,
        ordered,
        consumedUnlockingInvestmentIds
      );
      if (unlockers.length === 0) continue;

      for (const unlocker of unlockers) {
        consumedUnlockingInvestmentIds.add(unlocker.id);
      }

      poolAvailable = ledgerTruncateUsdt(
        Math.max(0, poolAvailable - candidate.projectedPayoutUsdt)
      );
      candidate.paid = true;
      candidate.payVia = "triad";
      triadPayouts += 1;
      trxBurned += trxPer;
      if (includeWithdrawals) trxBurned += trxPer;
      const unlockerLabels = unlockers
        .map((u) => {
          const inv = investments.find((i) => i.id === u.id);
          return inv?.label ?? u.id;
        })
        .join(" and ");
      pushEvent(
        "payout",
        candidate,
        candidate.projectedPayoutUsdt,
        `Triad payout ${candidate.projectedPayoutUsdt} USDT (${candidate.returnPercent}%); unlocked by ${unlockerLabels}; +${includeWithdrawals ? 2 : 1}×${trxPer} TRX (payout${includeWithdrawals ? "+withdraw" : ""})`
      );
    }
  };

  const startMs = Date.UTC(2026, 0, 1);
  queue.forEach((row, idx) => {
    const inv: MixedSimInvestment = {
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

    poolAvailable = ledgerTruncateUsdt(poolAvailable + principalUsdt);
    const surplusSlice = surplusPerSubscription(
      inv.projectedPayoutUsdt,
      principalUsdt
    );
    treasurySurplus = ledgerTruncateUsdt(treasurySurplus + surplusSlice);
    trxBurned += trxPer; // user → treasury invest

    pushEvent(
      "subscription",
      inv,
      principalUsdt,
      `+${surplusSlice} surplus on subscribe (${inv.fund}); +${trxPer} TRX (invest)`
    );

    trySurplusPays();
    tryTriadPays();
  });

  const unpaid = investments.filter((inv) => !inv.paid);
  const unpaidPayoutObligationUsdt = ledgerTruncateUsdt(
    unpaid.reduce((sum, inv) => sum + inv.projectedPayoutUsdt, 0)
  );
  const protectedRevenueCredited = ledgerTruncateUsdt(
    investments.length * protectedRevenueForAmount(principalUsdt)
  );
  const totalPayoutUsdt = ledgerTruncateUsdt(
    investments
      .filter((inv) => inv.paid)
      .reduce((sum, inv) => sum + inv.projectedPayoutUsdt, 0)
  );
  const trxCostUsdt = trxToUsdt(trxBurned, trxPrice);
  const transfersPerPaid = includeWithdrawals ? 2 : 1;
  const trxTransfers =
    investments.length +
    (triadPayouts + surplusPayoutCount) * transfersPerPaid;

  const summary: MixedSimSummary = {
    investmentCount: investments.length,
    principalUsdt,
    grossSubscribed: ledgerTruncateUsdt(investments.length * principalUsdt),
    triadPayouts,
    surplusPayouts: surplusPayoutCount,
    totalPayoutUsdt,
    unpaidCount: unpaid.length,
    unpaidPayoutObligationUsdt,
    poolAvailable,
    treasurySurplus,
    protectedWithdrawable: ledgerProtectedWithdrawable(
      poolAvailable,
      treasurySurplus
    ),
    protectedRevenueCredited,
    trxTransfers,
    trxBurned,
    trxCostUsdt,
    platformMarginAfterTrxUsdt: ledgerTruncateUsdt(
      protectedRevenueCredited - trxCostUsdt
    ),
    residualAfterObligationsAndTrxUsdt: ledgerTruncateUsdt(
      poolAvailable + treasurySurplus - unpaidPayoutObligationUsdt - trxCostUsdt
    ),
  };

  return { events, summary, investments };
}

export function mixedSimEventsToCsv(events: MixedSimEvent[]): string {
  const header = [
    "step",
    "event",
    "fund",
    "return_percent",
    "label",
    "amount_usdt",
    "pool_available",
    "treasury_surplus",
    "protected_withdrawable",
    "trx_burned_cumulative",
    "trx_cost_usdt_cumulative",
    "notes",
  ].join(",");
  const lines = events.map((e) =>
    [
      e.step,
      e.event,
      e.fund,
      e.returnPercent,
      e.label,
      e.amountUsdt,
      e.poolAvailable.toFixed(2),
      e.treasurySurplus.toFixed(2),
      e.protectedWithdrawable.toFixed(2),
      e.trxBurnedCumulative,
      e.trxCostUsdtCumulative.toFixed(2),
      `"${e.notes.replace(/"/g, '""')}"`,
    ].join(",")
  );
  return [header, ...lines].join("\n") + "\n";
}

export function writeMixedFunds50TrxSimulationCsv(
  outRelativePath = "specs/revenue-engine/simulations/mixed-funds-200-ticket50-with-trx-simulation.csv"
): { path: string; summary: MixedSimSummary } {
  const { events, summary } = runMixedFunds50TrxSimulation({
    perFund: 40,
    principalUsdt: 50,
    seed: 50,
    includeWithdrawals: true,
  });
  const path = join(process.cwd(), outRelativePath);
  writeFileSync(path, mixedSimEventsToCsv(events), "utf8");
  return { path, summary };
}
