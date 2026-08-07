import {
  UsdtArsQuoteSource,
  UsdtArsQuoteStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchDolarApiCriptoVenta } from "./dolarApiCripto";
import { fetchCriptoYaUsdtArsMaxAsk } from "./fetchCriptoYaUsdtArs";

export const USDT_ARS_QUOTE_SNAPSHOT_ID = "current";
/** Treat quote as stale after 3 missed 5-minute crons. */
export const USDT_ARS_QUOTE_MAX_AGE_MS = 15 * 60 * 1000;

export type RefreshUsdtArsQuoteResult =
  | {
      ok: true;
      arsPerUsdt: number;
      source: UsdtArsQuoteSource;
      sourceDetail: string | null;
      fetchedAt: string;
    }
  | {
      ok: false;
      lastError: string;
    };

export async function refreshUsdtArsQuote(): Promise<RefreshUsdtArsQuoteResult> {
  const errors: string[] = [];

  try {
    const cy = await fetchCriptoYaUsdtArsMaxAsk();
    const fetchedAt = new Date();
    await upsertQuote({
      arsPerUsdt: cy.arsPerUsdt,
      status: UsdtArsQuoteStatus.available,
      source: UsdtArsQuoteSource.criptoya,
      sourceDetail: cy.exchangeKey,
      fetchedAt,
      lastError: null,
    });
    return {
      ok: true,
      arsPerUsdt: cy.arsPerUsdt,
      source: UsdtArsQuoteSource.criptoya,
      sourceDetail: cy.exchangeKey,
      fetchedAt: fetchedAt.toISOString(),
    };
  } catch (error) {
    errors.push(
      `criptoya: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    const da = await fetchDolarApiCriptoVenta();
    const fetchedAt = new Date();
    await upsertQuote({
      arsPerUsdt: da.arsPerUsdt,
      status: UsdtArsQuoteStatus.available,
      source: UsdtArsQuoteSource.dolarapi,
      sourceDetail: "cripto.venta",
      fetchedAt,
      lastError: null,
    });
    return {
      ok: true,
      arsPerUsdt: da.arsPerUsdt,
      source: UsdtArsQuoteSource.dolarapi,
      sourceDetail: "cripto.venta",
      fetchedAt: fetchedAt.toISOString(),
    };
  } catch (error) {
    errors.push(
      `dolarapi: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const lastError = errors.join(" | ");
  await upsertQuote({
    arsPerUsdt: null,
    status: UsdtArsQuoteStatus.unavailable,
    source: null,
    sourceDetail: null,
    fetchedAt: new Date(),
    lastError,
  });

  return { ok: false, lastError };
}

async function upsertQuote(data: {
  arsPerUsdt: number | null;
  status: UsdtArsQuoteStatus;
  source: UsdtArsQuoteSource | null;
  sourceDetail: string | null;
  fetchedAt: Date;
  lastError: string | null;
}) {
  await prisma.usdtArsQuoteSnapshot.upsert({
    where: { id: USDT_ARS_QUOTE_SNAPSHOT_ID },
    create: { id: USDT_ARS_QUOTE_SNAPSHOT_ID, ...data },
    update: data,
  });
}

export type UsdtArsQuoteForPurchase =
  | {
      ok: true;
      arsPerUsdt: number;
      source: UsdtArsQuoteSource;
      sourceDetail: string | null;
      fetchedAt: Date;
    }
  | { ok: false; reason: "missing" | "unavailable" | "stale" | "invalid" };

export function isUsdtArsQuoteFresh(
  fetchedAt: Date | null | undefined,
  now: Date = new Date(),
  maxAgeMs: number = USDT_ARS_QUOTE_MAX_AGE_MS
): boolean {
  if (!fetchedAt) return false;
  return now.getTime() - fetchedAt.getTime() <= maxAgeMs;
}

export async function getUsdtArsQuoteForPurchase(
  now: Date = new Date()
): Promise<UsdtArsQuoteForPurchase> {
  const snap = await prisma.usdtArsQuoteSnapshot.findUnique({
    where: { id: USDT_ARS_QUOTE_SNAPSHOT_ID },
  });

  if (!snap) {
    return { ok: false, reason: "missing" };
  }
  if (snap.status !== UsdtArsQuoteStatus.available) {
    return { ok: false, reason: "unavailable" };
  }
  if (
    snap.arsPerUsdt == null ||
    !Number.isFinite(snap.arsPerUsdt) ||
    snap.arsPerUsdt <= 0
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (!isUsdtArsQuoteFresh(snap.fetchedAt, now)) {
    return { ok: false, reason: "stale" };
  }
  if (!snap.source) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    arsPerUsdt: snap.arsPerUsdt,
    source: snap.source,
    sourceDetail: snap.sourceDetail,
    fetchedAt: snap.fetchedAt!,
  };
}
