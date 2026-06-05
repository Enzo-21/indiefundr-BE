import type { Investment, PurchaseOrder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import * as tron from "@/services/tron/client";
import {
  linksFromInvestment,
  linksFromPurchaseOrder,
  usdtLinks,
  type WalletOnChainLinks,
} from "./walletOnChainLinks";

type ActivityRowLike = {
  kind: string;
  entityId: string | null;
};

function transactionFromJson(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export async function hydrateActivityOnChainLinksBatch(
  userId: string,
  rows: ActivityRowLike[]
): Promise<Map<string, WalletOnChainLinks>> {
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
  const missingOrderIds = new Set<string>();
  for (const inv of investments) {
    if (inv.purchaseOrderId && !ordersById.has(inv.purchaseOrderId)) {
      missingOrderIds.add(inv.purchaseOrderId);
    }
  }
  if (missingOrderIds.size > 0) {
    const extraOrders = await prisma.purchaseOrder.findMany({
      where: { userId, id: { in: [...missingOrderIds] } },
    });
    for (const order of extraOrders) {
      ordersById.set(order.id, order);
    }
  }
  const orderByInvestmentId = new Map<string, PurchaseOrder>();
  for (const order of ordersById.values()) {
    if (order.investmentId) {
      orderByInvestmentId.set(order.investmentId, order);
    }
  }

  const result = new Map<string, WalletOnChainLinks>();
  for (const row of fundRows) {
    const key = `${row.kind}:${row.entityId}`;
    if (row.kind === "purchase_order") {
      const order = ordersById.get(row.entityId!);
      if (!order) continue;
      result.set(key, linksFromPurchaseOrder(order));
      continue;
    }
    const inv = investmentsById.get(row.entityId!);
    if (!inv) continue;
    if (row.kind === "redemption") {
      const redeemTxId = tron.getTxId(
        transactionFromJson(inv.redemptionTransaction)
      );
      result.set(key, { ...usdtLinks(redeemTxId), topUpTxId: null, topUpTronscanUrl: null });
      continue;
    }
    const linkedOrder =
      (inv.purchaseOrderId ? ordersById.get(inv.purchaseOrderId) : null) ??
      orderByInvestmentId.get(inv.id) ??
      null;
    result.set(key, linksFromInvestment(inv, linkedOrder ?? undefined));
  }
  return result;
}
