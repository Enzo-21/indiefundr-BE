import type { Investment, PurchaseOrder } from "@prisma/client";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import { getFundById } from "@/lib/config/investmentFunds";
import { projectedPayoutUsdt } from "@/lib/config/pricing";
import {
  defaultTypicalPayoutDays,
  payoutDaysBetweenFloor,
} from "@/services/funds/typicalPayoutDays";

export type TransactionInsightsKind =
  | "purchase_order"
  | "investment"
  | "redemption";

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
  extras?: Partial<
    Pick<
      TransactionInsights,
      | "payoutDaysElapsed"
      | "creditedUsdt"
      | "typicalPayoutDays"
      | "investmentId"
      | "purchaseOrderId"
    >
  >
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
  };
}

export function insightsFromInvestment(
  investment: Investment,
  fund?: InvestmentFund | null,
  typicalPayoutDays?: number
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
  typicalPayoutDays?: number
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
    }
  );
}

export function insightsFromRedemption(
  investment: Investment,
  fund?: InvestmentFund | null,
  creditedUsdt?: number,
  typicalPayoutDays?: number
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
    }
  );
}
