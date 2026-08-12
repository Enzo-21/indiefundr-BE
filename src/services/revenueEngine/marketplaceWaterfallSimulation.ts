import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import {
  buildMixedFundQueue,
  projectedPayoutForFund,
  type SimFundKey,
} from "./mixedFunds50TrxSimulation";

/** Ticket fijo por inversión (ARS). */
export const SIM_WATERFALL_PRINCIPAL_ARS = 100_000;

/**
 * Margen de la aplicación sobre cada cobro (application_fee / marketplace).
 * Sale del bruto del ticket; el resto se reparte en waterfall FIFO.
 */
export const SIM_APP_FEE_PCT = 10;

function roundArs(value: number): number {
  return ledgerTruncateUsdt(value);
}

function feePct(amount: number, pct: number): number {
  return roundArs(amount * (pct / 100));
}

export type WaterfallInv = {
  id: string;
  label: string;
  fund: SimFundKey;
  returnPercent: number;
  principalArs: number;
  targetPayoutArs: number;
  paidToDateArs: number;
  subscribedAt: Date;
};

export type WaterfallEvent = {
  step: number;
  event: "subscription" | "split" | "payout_closed" | "float_credit";
  fromLabel: string;
  toLabel: string;
  fund: SimFundKey | "";
  returnPercent: number | "";
  amountArs: number;
  appFeeArs: number;
  headPaidToDate: number;
  headRemaining: number;
  appFeeCumulative: number;
  platformFloat: number;
  openObligationTotal: number;
  notes: string;
};

export type WaterfallSummary = {
  investmentCount: number;
  principalArs: number;
  appFeePct: number;
  grossSubscribed: number;
  appFeeTotal: number;
  distributableTotal: number;
  splitToUsersTotal: number;
  floatCreditedTotal: number;
  closedPayouts: number;
  totalPaidToUsers: number;
  unpaidCount: number;
  openObligationTotal: number;
  platformFloat: number;
  /** Caja app = fees + float − (nada más en este modelo; el payout sale de splits). */
  appCashTotal: number;
  /** Obligación abierta − float (hueco si float no se usa para cerrar). */
  residualGapArs: number;
};

function headRemaining(inv: WaterfallInv): number {
  return roundArs(Math.max(0, inv.targetPayoutArs - inv.paidToDateArs));
}

function openObligation(investments: WaterfallInv[]): number {
  return roundArs(
    investments.reduce((sum, inv) => sum + headRemaining(inv), 0)
  );
}

/**
 * Marketplace waterfall:
 * - Cada ticket 100k; app se queda 10%; 90k se reparte FIFO a heads anteriores impagos.
 * - El primer usuario (bootstrap) manda su neto a float de la plataforma.
 * - Sobrante tras cubrir heads anteriores → float.
 * - Un head cierra al alcanzar su target (principal × (1+return%)).
 */
export function runMarketplaceWaterfallSimulation(options: {
  perFund?: number;
  principalArs?: number;
  appFeePct?: number;
  seed?: number;
} = {}): {
  events: WaterfallEvent[];
  summary: WaterfallSummary;
  investments: WaterfallInv[];
} {
  const principalArs = options.principalArs ?? SIM_WATERFALL_PRINCIPAL_ARS;
  const appFeePct = options.appFeePct ?? SIM_APP_FEE_PCT;

  const queue = buildMixedFundQueue({
    perFund: options.perFund ?? 40,
    principalUsdt: principalArs,
    seed: options.seed ?? 100_010,
  });

  const investments: WaterfallInv[] = [];
  const events: WaterfallEvent[] = [];
  let step = 0;
  let appFeeCumulative = 0;
  let platformFloat = 0;
  let splitToUsersTotal = 0;
  let floatCreditedTotal = 0;
  let closedPayouts = 0;

  const push = (partial: Omit<WaterfallEvent, "step" | "appFeeCumulative" | "platformFloat" | "openObligationTotal">) => {
    step += 1;
    events.push({
      step,
      ...partial,
      appFeeCumulative,
      platformFloat,
      openObligationTotal: openObligation(investments),
    });
  };

  const startMs = Date.UTC(2026, 0, 1);

  queue.forEach((row, idx) => {
    const inv: WaterfallInv = {
      id: `inv-${idx + 1}`,
      label: row.label,
      fund: row.fund,
      returnPercent: row.returnPercent,
      principalArs,
      targetPayoutArs: projectedPayoutForFund(principalArs, row.returnPercent),
      paidToDateArs: 0,
      subscribedAt: new Date(startMs + idx * 60_000),
    };
    investments.push(inv);

    const appFeeArs = feePct(principalArs, appFeePct);
    const distributable = roundArs(principalArs - appFeeArs);
    appFeeCumulative = roundArs(appFeeCumulative + appFeeArs);

    push({
      event: "subscription",
      fromLabel: inv.label,
      toLabel: "platform",
      fund: inv.fund,
      returnPercent: inv.returnPercent,
      amountArs: principalArs,
      appFeeArs,
      headPaidToDate: inv.paidToDateArs,
      headRemaining: headRemaining(inv),
      notes: `Ticket ${principalArs} ARS; app fee ${appFeeArs} (${appFeePct}%); distributable ${distributable}; target payout ${inv.targetPayoutArs}`,
    });

    let remaining = distributable;

    // Bootstrap: primer ticket entero (neto) queda en float de la app.
    if (idx === 0) {
      platformFloat = roundArs(platformFloat + remaining);
      floatCreditedTotal = roundArs(floatCreditedTotal + remaining);
      push({
        event: "float_credit",
        fromLabel: inv.label,
        toLabel: "platform_float",
        fund: inv.fund,
        returnPercent: inv.returnPercent,
        amountArs: remaining,
        appFeeArs: 0,
        headPaidToDate: 0,
        headRemaining: headRemaining(inv),
        notes: `Bootstrap: net ${remaining} ARS to platform float (first subscriber pays the app)`,
      });
      remaining = 0;
    } else {
      const earlierUnpaid = investments
        .filter((h) => h.id !== inv.id && headRemaining(h) > 0)
        .sort((a, b) => a.subscribedAt.getTime() - b.subscribedAt.getTime());

      for (const head of earlierUnpaid) {
        if (remaining <= 0) break;
        const need = headRemaining(head);
        const take = roundArs(Math.min(need, remaining));
        if (take <= 0) continue;

        head.paidToDateArs = roundArs(head.paidToDateArs + take);
        remaining = roundArs(remaining - take);
        splitToUsersTotal = roundArs(splitToUsersTotal + take);

        push({
          event: "split",
          fromLabel: inv.label,
          toLabel: head.label,
          fund: head.fund,
          returnPercent: head.returnPercent,
          amountArs: take,
          appFeeArs: 0,
          headPaidToDate: head.paidToDateArs,
          headRemaining: headRemaining(head),
          notes: `Waterfall split ${take} ARS from ${inv.label} → ${head.label} (${head.paidToDateArs}/${head.targetPayoutArs})`,
        });

        if (headRemaining(head) <= 0) {
          closedPayouts += 1;
          push({
            event: "payout_closed",
            fromLabel: inv.label,
            toLabel: head.label,
            fund: head.fund,
            returnPercent: head.returnPercent,
            amountArs: head.targetPayoutArs,
            appFeeArs: 0,
            headPaidToDate: head.paidToDateArs,
            headRemaining: 0,
            notes: `Payout closed for ${head.label}: ${head.targetPayoutArs} ARS (${head.returnPercent}%) funded via marketplace splits`,
          });
        }
      }

      if (remaining > 0) {
        platformFloat = roundArs(platformFloat + remaining);
        floatCreditedTotal = roundArs(floatCreditedTotal + remaining);
        push({
          event: "float_credit",
          fromLabel: inv.label,
          toLabel: "platform_float",
          fund: inv.fund,
          returnPercent: inv.returnPercent,
          amountArs: remaining,
          appFeeArs: 0,
          headPaidToDate: inv.paidToDateArs,
          headRemaining: headRemaining(inv),
          notes: `Leftover ${remaining} ARS after FIFO heads → platform float`,
        });
      }
    }
  });

  const unpaid = investments.filter((inv) => headRemaining(inv) > 0);
  const openObligationTotal = openObligation(investments);
  const totalPaidToUsers = roundArs(
    investments.reduce((sum, inv) => sum + inv.paidToDateArs, 0)
  );
  const grossSubscribed = roundArs(investments.length * principalArs);
  const appFeeTotal = appFeeCumulative;
  const distributableTotal = roundArs(grossSubscribed - appFeeTotal);

  const summary: WaterfallSummary = {
    investmentCount: investments.length,
    principalArs,
    appFeePct,
    grossSubscribed,
    appFeeTotal,
    distributableTotal,
    splitToUsersTotal,
    floatCreditedTotal,
    closedPayouts,
    totalPaidToUsers,
    unpaidCount: unpaid.length,
    openObligationTotal,
    platformFloat,
    appCashTotal: roundArs(appFeeTotal + platformFloat),
    residualGapArs: roundArs(openObligationTotal - platformFloat),
  };

  return { events, summary, investments };
}

export function marketplaceWaterfallEventsToCsv(events: WaterfallEvent[]): string {
  const header = [
    "step",
    "event",
    "from_label",
    "to_label",
    "fund",
    "return_percent",
    "amount_ars",
    "app_fee_ars",
    "head_paid_to_date",
    "head_remaining",
    "app_fee_cumulative",
    "platform_float",
    "open_obligation_total",
    "notes",
  ].join(",");

  const lines = events.map((e) =>
    [
      e.step,
      e.event,
      e.fromLabel,
      e.toLabel,
      e.fund,
      e.returnPercent,
      e.amountArs,
      e.appFeeArs,
      e.headPaidToDate.toFixed(2),
      e.headRemaining.toFixed(2),
      e.appFeeCumulative.toFixed(2),
      e.platformFloat.toFixed(2),
      e.openObligationTotal.toFixed(2),
      `"${e.notes.replace(/"/g, '""')}"`,
    ].join(",")
  );
  return [header, ...lines].join("\n") + "\n";
}

export function writeMarketplaceWaterfallSimulationCsv(
  outRelativePath = "specs/revenue-engine/simulations/mixed-funds-200-ticket100k-mp-marketplace-waterfall-10pct.csv"
): { path: string; summary: WaterfallSummary } {
  const { events, summary } = runMarketplaceWaterfallSimulation({
    perFund: 40,
    principalArs: SIM_WATERFALL_PRINCIPAL_ARS,
    appFeePct: SIM_APP_FEE_PCT,
    seed: 100_010,
  });
  const path = join(process.cwd(), outRelativePath);
  writeFileSync(path, marketplaceWaterfallEventsToCsv(events), "utf8");
  return { path, summary };
}
