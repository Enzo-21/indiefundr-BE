import type { Investment, PurchaseOrder } from "@prisma/client";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import * as tron from "@/services/tron/client";

export type WalletOnChainLinks = {
  txId: string | null;
  tronscanUrl: string | null;
  topUpTxId: string | null;
  topUpTronscanUrl: string | null;
};

export function topUpLinks(
  topUpTxId: string | null | undefined
): Pick<WalletOnChainLinks, "topUpTxId" | "topUpTronscanUrl"> {
  if (!topUpTxId) {
    return { topUpTxId: null, topUpTronscanUrl: null };
  }
  return {
    topUpTxId,
    topUpTronscanUrl: getTronscanTxUrl(topUpTxId),
  };
}

export function usdtLinks(txId: string | null | undefined): Pick<
  WalletOnChainLinks,
  "txId" | "tronscanUrl"
> {
  const id = txId ?? null;
  return {
    txId: id,
    tronscanUrl: id ? getTronscanTxUrl(id) : null,
  };
}

export function linksFromPurchaseOrder(
  order: Pick<PurchaseOrder, "usdtTxId" | "topUpTxId">
): WalletOnChainLinks {
  return {
    ...usdtLinks(order.usdtTxId),
    ...topUpLinks(order.topUpTxId),
  };
}

function transactionFromJson(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function linksFromInvestment(
  investment: Pick<Investment, "transaction" | "purchaseOrderId">,
  linkedOrder?: Pick<PurchaseOrder, "usdtTxId" | "topUpTxId"> | null
): WalletOnChainLinks {
  const invTxId = tron.getTxId(transactionFromJson(investment.transaction));
  if (linkedOrder) {
    const orderLinks = linksFromPurchaseOrder(linkedOrder);
    return {
      txId: orderLinks.txId ?? invTxId,
      tronscanUrl:
        orderLinks.tronscanUrl ??
        (invTxId ? getTronscanTxUrl(invTxId) : null),
      topUpTxId: orderLinks.topUpTxId,
      topUpTronscanUrl: orderLinks.topUpTronscanUrl,
    };
  }
  return {
    ...usdtLinks(invTxId),
    ...topUpLinks(null),
  };
}

export function mergeOnChainLinks(
  primary: Partial<WalletOnChainLinks>,
  fallback?: Partial<WalletOnChainLinks> | null
): WalletOnChainLinks {
  const txId = primary.txId ?? fallback?.txId ?? null;
  const topUpTxId = primary.topUpTxId ?? fallback?.topUpTxId ?? null;
  return {
    txId,
    tronscanUrl:
      primary.tronscanUrl ??
      fallback?.tronscanUrl ??
      (txId ? getTronscanTxUrl(txId) : null),
    topUpTxId,
    topUpTronscanUrl:
      primary.topUpTronscanUrl ??
      fallback?.topUpTronscanUrl ??
      (topUpTxId ? getTronscanTxUrl(topUpTxId) : null),
  };
}
