import {
  getAdminQuotePairMeta,
  type AdminQuoteRateDto,
  DEFAULT_ADMIN_QUOTE_PAIR_ID,
} from "@/services/quotes/adminQuotePairRegistry";
import {
  isUsdtArsQuoteFresh,
  refreshUsdtArsQuote,
  USDT_ARS_QUOTE_SNAPSHOT_ID,
} from "@/services/quotes/refreshUsdtArsQuote";
import { prisma } from "@/lib/prisma";

export {
  ADMIN_QUOTE_PAIR_IDS,
  ADMIN_QUOTE_PAIRS,
  DEFAULT_ADMIN_QUOTE_PAIR_ID,
  getAdminQuotePairMeta,
  isAdminQuotePairId,
  type AdminQuotePairId,
  type AdminQuotePairMeta,
  type AdminQuoteRateDto,
} from "@/services/quotes/adminQuotePairRegistry";

/** Pure mapper — unit-tested without prisma. */
export function mapUsdtArsSnapshotToAdminQuoteRate(
  snap: {
    arsPerUsdt: number | null;
    status: string;
    source: string | null;
    sourceDetail: string | null;
    fetchedAt: Date | null;
    lastError: string | null;
  } | null,
  now: Date = new Date()
): AdminQuoteRateDto {
  const meta = getAdminQuotePairMeta("usdt-ars");
  if (!snap) {
    return {
      pairId: meta.id,
      label: meta.label,
      base: meta.base,
      quote: meta.quote,
      rate: null,
      status: "unavailable",
      source: null,
      sourceDetail: null,
      fetchedAt: null,
      lastError: null,
      stale: true,
    };
  }

  const status = snap.status === "available" ? "available" : "unavailable";
  const fetchedAt = snap.fetchedAt;
  const stale =
    status !== "available" || !isUsdtArsQuoteFresh(fetchedAt, now);

  return {
    pairId: meta.id,
    label: meta.label,
    base: meta.base,
    quote: meta.quote,
    rate:
      snap.arsPerUsdt != null && Number.isFinite(snap.arsPerUsdt)
        ? snap.arsPerUsdt
        : null,
    status,
    source: snap.source,
    sourceDetail: snap.sourceDetail,
    fetchedAt: fetchedAt ? fetchedAt.toISOString() : null,
    lastError: snap.lastError,
    stale,
  };
}

export async function getAdminQuoteRate(
  pairId: string = DEFAULT_ADMIN_QUOTE_PAIR_ID,
  now: Date = new Date()
): Promise<AdminQuoteRateDto> {
  const meta = getAdminQuotePairMeta(pairId);

  if (meta.id === "usdt-ars") {
    const snap = await prisma.usdtArsQuoteSnapshot.findUnique({
      where: { id: USDT_ARS_QUOTE_SNAPSHOT_ID },
    });
    return mapUsdtArsSnapshotToAdminQuoteRate(snap, now);
  }

  throw new Error(`Quote pair not implemented: ${meta.id}`);
}

export async function refreshAdminQuoteRate(
  pairId: string,
  now: Date = new Date()
): Promise<AdminQuoteRateDto> {
  const meta = getAdminQuotePairMeta(pairId);

  if (meta.id === "usdt-ars") {
    const result = await refreshUsdtArsQuote();
    const dto = await getAdminQuoteRate(meta.id, now);
    if (!result.ok) {
      throw new Error(result.lastError || "USDT/ARS quote refresh failed");
    }
    return dto;
  }

  throw new Error(`Quote pair not implemented: ${meta.id}`);
}
