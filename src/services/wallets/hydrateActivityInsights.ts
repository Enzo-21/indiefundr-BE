import type { Investment, PurchaseOrder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFundById } from "@/lib/config/investmentFunds";
import {
  loadTypicalPayoutDaysByFundIds,
  resolveTypicalPayoutDays,
} from "@/services/funds/typicalPayoutDays";
import {
  insightsFromInvestment,
  insightsFromPurchaseOrder,
  insightsFromRedemption,
  type TransactionInsights,
} from "./transactionInsights";

type ActivityRowLike = {
  kind: string;
  entityId: string | null;
  amountUsdt: number;
};

export async function hydrateActivityInsights(
  userId: string,
  row: ActivityRowLike
): Promise<TransactionInsights | null> {
  if (!row.entityId) {
    return null;
  }

  if (row.kind === "investment" || row.kind === "redemption") {
    const investment = await prisma.investment.findFirst({
      where: { id: row.entityId, userId },
    });
    if (!investment) {
      return null;
    }
    const fund = getFundById(investment.fundId);
    const typicalByFund = await loadTypicalPayoutDaysByFundIds([
      investment.fundId,
    ]);
    const typical = resolveTypicalPayoutDays(
      investment.fundId,
      fund?.termDays ?? 90,
      typicalByFund
    );
    if (row.kind === "redemption") {
      return insightsFromRedemption(investment, fund, row.amountUsdt, typical);
    }
    return insightsFromInvestment(investment, fund, typical);
  }

  if (row.kind === "purchase_order") {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id: row.entityId, userId },
    });
    if (!order) {
      return null;
    }
    const fund = getFundById(order.fundId);
    let linkedInvestment: Investment | null = null;
    if (order.investmentId) {
      linkedInvestment = await prisma.investment.findFirst({
        where: { id: order.investmentId, userId },
      });
    }
    const typicalByFund = await loadTypicalPayoutDaysByFundIds([order.fundId]);
    const typical = resolveTypicalPayoutDays(
      order.fundId,
      fund?.termDays ?? 90,
      typicalByFund
    );
    return insightsFromPurchaseOrder(order, fund, linkedInvestment, typical);
  }

  return null;
}

export async function hydrateActivityInsightsBatch(
  userId: string,
  rows: ActivityRowLike[]
): Promise<Map<string, TransactionInsights>> {
  const fundRows = rows.filter(
    (r) =>
      r.entityId &&
      (r.kind === "investment" ||
        r.kind === "redemption" ||
        r.kind === "purchase_order")
  );
  const investmentIds = new Set<string>();
  const orderIds = new Set<string>();
  for (const row of fundRows) {
    if (row.kind === "investment" || row.kind === "redemption") {
      investmentIds.add(row.entityId!);
    } else if (row.kind === "purchase_order") {
      orderIds.add(row.entityId!);
    }
  }

  const [investments, orders] = await Promise.all([
    investmentIds.size > 0
      ? prisma.investment.findMany({
          where: { userId, id: { in: [...investmentIds] } },
        })
      : Promise.resolve([] as Investment[]),
    orderIds.size > 0
      ? prisma.purchaseOrder.findMany({
          where: { userId, id: { in: [...orderIds] } },
        })
      : Promise.resolve([] as PurchaseOrder[]),
  ]);

  const investmentsById = new Map(investments.map((inv) => [inv.id, inv]));
  const ordersById = new Map(orders.map((o) => [o.id, o]));
  const typicalByFund = await loadTypicalPayoutDaysByFundIds([
    ...investments.map((inv) => inv.fundId),
    ...orders.map((order) => order.fundId),
  ]);

  const result = new Map<string, TransactionInsights>();
  for (const row of fundRows) {
    const key = `${row.kind}:${row.entityId}`;
    if (row.kind === "investment" || row.kind === "redemption") {
      const inv = investmentsById.get(row.entityId!);
      if (!inv) continue;
      const fund = getFundById(inv.fundId);
      const typical = resolveTypicalPayoutDays(
        inv.fundId,
        fund?.termDays ?? 90,
        typicalByFund
      );
      result.set(
        key,
        row.kind === "redemption"
          ? insightsFromRedemption(inv, fund, row.amountUsdt, typical)
          : insightsFromInvestment(inv, fund, typical)
      );
    } else if (row.kind === "purchase_order") {
      const order = ordersById.get(row.entityId!);
      if (!order) continue;
      const fund = getFundById(order.fundId);
      const linked = order.investmentId
        ? investmentsById.get(order.investmentId) ??
          (await prisma.investment.findFirst({
            where: { id: order.investmentId, userId },
          }))
        : null;
      if (linked && !investmentsById.has(linked.id)) {
        investmentsById.set(linked.id, linked);
      }
      const typical = resolveTypicalPayoutDays(
        order.fundId,
        fund?.termDays ?? 90,
        typicalByFund
      );
      result.set(
        key,
        insightsFromPurchaseOrder(order, fund, linked ?? null, typical)
      );
    }
  }
  return result;
}
