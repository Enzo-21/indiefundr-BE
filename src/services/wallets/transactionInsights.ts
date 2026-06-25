import type { Investment, PurchaseOrder } from "@prisma/client";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import { getFundById } from "@/lib/config/investmentFunds";
import { projectedPayoutUsdt } from "@/lib/config/pricing";
import type {
  MaturityChosenPath,
  MaturitySituation,
} from "@/lib/investments/maturitySituation";
import { resolveInvestmentMaturitySituation } from "@/lib/investments/presentation";
import {
  defaultTypicalPayoutDays,
  payoutDaysBetweenFloor,
} from "@/services/funds/typicalPayoutDays";

export type TransactionInsightsKind =
  | "purchase_order"
  | "investment"
  | "redemption";

export type TransactionInsightsContext = {
  fifoEligibleIds?: ReadonlySet<string>;
};

export type TransactionInsights = {
  kind: TransactionInsightsKind;
  fundId: string;
  fundName: string;
  principalUsdt: number;
  projectedPayoutUsdt: number;
  targetReturnPercent: number;
  expectedEarningsUsdt: number;
  maxTermDays: number;
  typicalPayoutDays: number;
  subscribedAt: string | null;
  maturesAt: string | null;
  redeemedAt: string | null;
  payoutDaysElapsed: number | null;
  creditedUsdt: number | null;
  investmentId: string | null;
  purchaseOrderId: string | null;
  investmentStatus: string | null;
  situation: MaturitySituation | null;
  statusLabel: string | null;
  statusDetail: string | null;
  chosenPath: MaturityChosenPath | null;
  nextDeadlineAt: string | null;
  nextDeadlineLabel: string | null;
  globalQueueRank: number | null;
  newSubscribersNeeded: number | null;
  needsUnpaidMaturityChoice: boolean;
};

function roundUsdt(value: number): number {
  return parseFloat(value.toFixed(4));
}

function subscribeDate(inv: Pick<Investment, "subscribedAt" | "date">): Date {
  return inv.subscribedAt ?? inv.date;
}

function fundOrFallback(fundId: string): InvestmentFund {
  return (
    getFundById(fundId) ?? {
      id: fundId,
      name: fundId,
      tagline: "",
      returnPercent90d: 0,
      termDays: 90,
      maxOpenInvestments: 1,
      riskLevel: "medium",
      riskLabel: "Medium risk",
      destinations: [],
      accentColor: "#64748B",
      icon: "chart-line",
    }
  );
}

function baseInsights(
  kind: TransactionInsightsKind,
  fund: InvestmentFund,
  principalUsdt: number,
  projectedPayoutUsdtValue: number,
  targetReturnPercent: number,
  dates: {
    subscribedAt?: Date | null;
    maturesAt?: Date | null;
    redeemedAt?: Date | null;
  },
  extras?: Partial<TransactionInsights>
): TransactionInsights {
  const principal = roundUsdt(principalUsdt);
  const projected = roundUsdt(projectedPayoutUsdtValue);
  return {
    kind,
    fundId: fund.id,
    fundName: fund.name,
    principalUsdt: principal,
    projectedPayoutUsdt: projected,
    targetReturnPercent,
    expectedEarningsUsdt: roundUsdt(Math.max(0, projected - principal)),
    maxTermDays: fund.termDays,
    typicalPayoutDays:
      extras?.typicalPayoutDays ?? defaultTypicalPayoutDays(fund.termDays),
    subscribedAt: dates.subscribedAt?.toISOString() ?? null,
    maturesAt: dates.maturesAt?.toISOString() ?? null,
    redeemedAt: dates.redeemedAt?.toISOString() ?? null,
    payoutDaysElapsed: extras?.payoutDaysElapsed ?? null,
    creditedUsdt: extras?.creditedUsdt ?? null,
    investmentId: extras?.investmentId ?? null,
    purchaseOrderId: extras?.purchaseOrderId ?? null,
    investmentStatus: extras?.investmentStatus ?? null,
    situation: extras?.situation ?? null,
    statusLabel: extras?.statusLabel ?? null,
    statusDetail: extras?.statusDetail ?? null,
    chosenPath: extras?.chosenPath ?? null,
    nextDeadlineAt: extras?.nextDeadlineAt ?? null,
    nextDeadlineLabel: extras?.nextDeadlineLabel ?? null,
    globalQueueRank: extras?.globalQueueRank ?? null,
    newSubscribersNeeded: extras?.newSubscribersNeeded ?? null,
    needsUnpaidMaturityChoice: extras?.needsUnpaidMaturityChoice ?? false,
  };
}

function investmentLifecycleInsights(
  investment: Investment,
  context: TransactionInsightsContext = {}
): Pick<
  TransactionInsights,
  | "investmentStatus"
  | "situation"
  | "statusLabel"
  | "statusDetail"
  | "chosenPath"
  | "nextDeadlineAt"
  | "nextDeadlineLabel"
  | "globalQueueRank"
  | "newSubscribersNeeded"
  | "needsUnpaidMaturityChoice"
> {
  const maturity = resolveInvestmentMaturitySituation(investment, {
    fifoEligibleIds: context.fifoEligibleIds,
  });
  return {
    investmentStatus: investment.status,
    situation: maturity.situation,
    statusLabel: maturity.statusLabel,
    statusDetail: maturity.statusDetail,
    chosenPath: maturity.chosenPath,
    nextDeadlineAt: maturity.nextDeadlineAt,
    nextDeadlineLabel: maturity.nextDeadlineLabel,
    globalQueueRank: maturity.globalQueueRank,
    newSubscribersNeeded: maturity.newSubscribersNeeded,
    needsUnpaidMaturityChoice: maturity.needsUnpaidMaturityChoice,
  };
}

export function insightsFromInvestment(
  investment: Investment,
  fund?: InvestmentFund | null,
  typicalPayoutDays?: number,
  context: TransactionInsightsContext = {}
): TransactionInsights {
  const f = fund ?? fundOrFallback(investment.fundId);
  return baseInsights(
    "investment",
    f,
    investment.amountUsdt,
    investment.projectedPayoutUsdt,
    investment.returnPercent90d,
    {
      subscribedAt: subscribeDate(investment),
      maturesAt: investment.maturesAt,
      redeemedAt: investment.redeemedAt,
    },
    {
      typicalPayoutDays,
      investmentId: investment.id,
      purchaseOrderId: investment.purchaseOrderId,
      ...investmentLifecycleInsights(investment, context),
    }
  );
}

export function insightsFromPurchaseOrder(
  order: Pick<
    PurchaseOrder,
    "id" | "fundId" | "costUsdt" | "date" | "investmentId"
  >,
  fund?: InvestmentFund | null,
  linkedInvestment?: Investment | null,
  typicalPayoutDays?: number,
  context: TransactionInsightsContext = {}
): TransactionInsights {
  const f = fund ?? fundOrFallback(order.fundId);
  if (linkedInvestment) {
    return baseInsights(
      "purchase_order",
      f,
      linkedInvestment.amountUsdt,
      linkedInvestment.projectedPayoutUsdt,
      linkedInvestment.returnPercent90d,
      {
        subscribedAt: subscribeDate(linkedInvestment),
        maturesAt: linkedInvestment.maturesAt,
        redeemedAt: linkedInvestment.redeemedAt,
      },
      {
        typicalPayoutDays,
        investmentId: linkedInvestment.id,
        purchaseOrderId: linkedInvestment.purchaseOrderId ?? order.id,
        ...investmentLifecycleInsights(linkedInvestment, context),
      }
    );
  }
  const projected = projectedPayoutUsdt(order.costUsdt, f.returnPercent90d);
  return baseInsights(
    "purchase_order",
    f,
    order.costUsdt,
    projected,
    f.returnPercent90d,
    { subscribedAt: order.date },
    {
      typicalPayoutDays,
      purchaseOrderId: order.id,
      investmentId: order.investmentId,
      investmentStatus: null,
      situation: null,
      statusLabel: null,
      statusDetail: null,
      chosenPath: null,
      nextDeadlineAt: null,
      nextDeadlineLabel: null,
      globalQueueRank: null,
      newSubscribersNeeded: null,
      needsUnpaidMaturityChoice: false,
    }
  );
}

export function insightsFromRedemption(
  investment: Investment,
  fund?: InvestmentFund | null,
  creditedUsdt?: number,
  typicalPayoutDays?: number,
  context: TransactionInsightsContext = {}
): TransactionInsights {
  const f = fund ?? fundOrFallback(investment.fundId);
  const credited = creditedUsdt ?? investment.projectedPayoutUsdt;
  const subscribed = subscribeDate(investment);
  const redeemed = investment.redeemedAt;
  const payoutDaysElapsed =
    redeemed != null ? payoutDaysBetweenFloor(subscribed, redeemed) : null;

  return baseInsights(
    "redemption",
    f,
    investment.amountUsdt,
    investment.projectedPayoutUsdt,
    investment.returnPercent90d,
    {
      subscribedAt: subscribed,
      maturesAt: investment.maturesAt,
      redeemedAt: redeemed,
    },
    {
      payoutDaysElapsed,
      creditedUsdt: roundUsdt(credited),
      typicalPayoutDays,
      investmentId: investment.id,
      purchaseOrderId: investment.purchaseOrderId,
      ...investmentLifecycleInsights(investment, context),
    }
  );
}
