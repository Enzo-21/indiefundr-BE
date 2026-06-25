import { TreasuryEventType, type Investment, type TreasuryEvent } from "@prisma/client";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { prisma } from "@/lib/prisma";
import { surplusPerSubscription } from "@/services/revenueEngine/accounting";
import { isSurplusPayoutTrigger } from "@/services/revenueEngine/payoutScheduler";

export type InvestmentLedgerSource = Pick<
  Investment,
  "id" | "payoutTriggeredBy" | "projectedPayoutUsdt" | "amountUsdt"
>;

export type InvestmentLedgerSnapshot = {
  pool: number;
  surplus: number;
  protectedWithdrawable: number;
};

export type InvestmentLedgerEventKind =
  | "subscription"
  | "payout"
  | "surplus_payout";

export type InvestmentLedgerView = {
  afterSubscribe: InvestmentLedgerSnapshot | null;
  afterPayout: InvestmentLedgerSnapshot | null;
  subscribeEventCreatedAt: Date | null;
  payoutEventCreatedAt: Date | null;
  eventKind: InvestmentLedgerEventKind;
  /** Surplus credited on subscribe (`surplus_credit` or spec slice). */
  subscribeSurplusCredit: number | null;
  /** Surplus drawn for payout (`surplus_draw` sum). */
  payoutSurplusDraw: number;
};

export function protectedWithdrawable(
  pool: number | null | undefined,
  surplus: number | null | undefined
): number {
  if (pool == null || surplus == null) {
    return 0;
  }
  return ledgerTruncateUsdt(Math.max(0, pool - surplus));
}

function snapshotFromEvent(
  event: Pick<TreasuryEvent, "poolAfter" | "surplusAfter">
): InvestmentLedgerSnapshot | null {
  if (event.poolAfter == null || event.surplusAfter == null) {
    return null;
  }
  return {
    pool: ledgerTruncateUsdt(event.poolAfter),
    surplus: ledgerTruncateUsdt(event.surplusAfter),
    protectedWithdrawable: protectedWithdrawable(
      event.poolAfter,
      event.surplusAfter
    ),
  };
}

export function resolveLedgerEventKind(
  investment: Pick<Investment, "payoutTriggeredBy">,
  hasPayoutOutflow: boolean
): InvestmentLedgerEventKind {
  if (!hasPayoutOutflow) {
    return "subscription";
  }
  if (isSurplusPayoutTrigger(investment.payoutTriggeredBy)) {
    return "surplus_payout";
  }
  return "payout";
}

function latestEventByType(
  events: TreasuryEvent[],
  type: TreasuryEventType
): TreasuryEvent | undefined {
  let latest: TreasuryEvent | undefined;
  for (const event of events) {
    if (event.type !== type) continue;
    latest = event;
  }
  return latest;
}

function sumEventAmounts(
  events: TreasuryEvent[],
  type: TreasuryEventType
): number {
  let sum = 0;
  for (const event of events) {
    if (event.type !== type) continue;
    sum += event.amountUsdt;
  }
  return ledgerTruncateUsdt(sum);
}

function resolveSubscribeSurplusCredit(
  invEvents: TreasuryEvent[],
  projectedPayoutUsdt: number,
  amountUsdt: number
): number | null {
  const credited = sumEventAmounts(invEvents, TreasuryEventType.surplus_credit);
  if (credited > 0) {
    return credited;
  }
  const hasSubscribe = invEvents.some(
    (e) => e.type === TreasuryEventType.subscribe_inflow
  );
  if (!hasSubscribe) {
    return null;
  }
  return surplusPerSubscription(projectedPayoutUsdt, amountUsdt);
}

export function buildInvestmentLedgerViewsFromEvents(
  investments: InvestmentLedgerSource[],
  events: TreasuryEvent[]
): Map<string, InvestmentLedgerView> {
  const byInvestment = new Map<string, TreasuryEvent[]>();
  for (const event of events) {
    if (!event.investmentId) continue;
    const list = byInvestment.get(event.investmentId) ?? [];
    list.push(event);
    byInvestment.set(event.investmentId, list);
  }

  const views = new Map<string, InvestmentLedgerView>();
  for (const investment of investments) {
    const invEvents = byInvestment.get(investment.id) ?? [];
    const subscribeEvent = latestEventByType(
      invEvents,
      TreasuryEventType.subscribe_inflow
    );
    const payoutEvent = latestEventByType(
      invEvents,
      TreasuryEventType.payout_outflow
    );
    const afterSubscribe = subscribeEvent
      ? snapshotFromEvent(subscribeEvent)
      : null;
    const afterPayout = payoutEvent ? snapshotFromEvent(payoutEvent) : null;
    const subscribeSurplusCredit = resolveSubscribeSurplusCredit(
      invEvents,
      investment.projectedPayoutUsdt,
      investment.amountUsdt
    );
    const payoutSurplusDraw = sumEventAmounts(
      invEvents,
      TreasuryEventType.surplus_draw
    );

    views.set(investment.id, {
      afterSubscribe,
      afterPayout,
      subscribeEventCreatedAt: subscribeEvent?.createdAt ?? null,
      payoutEventCreatedAt: payoutEvent?.createdAt ?? null,
      eventKind: resolveLedgerEventKind(investment, payoutEvent != null),
      subscribeSurplusCredit,
      payoutSurplusDraw,
    });
  }

  return views;
}

export async function buildInvestmentLedgerSnapshotMap(
  investmentIds: string[],
  investments: InvestmentLedgerSource[]
): Promise<Map<string, InvestmentLedgerView>> {
  if (investmentIds.length === 0) {
    return new Map();
  }

  const events = await prisma.treasuryEvent.findMany({
    where: {
      investmentId: { in: investmentIds },
      type: {
        in: [
          TreasuryEventType.subscribe_inflow,
          TreasuryEventType.payout_outflow,
          TreasuryEventType.surplus_credit,
          TreasuryEventType.surplus_draw,
        ],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return buildInvestmentLedgerViewsFromEvents(investments, events);
}
