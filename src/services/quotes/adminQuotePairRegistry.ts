export const ADMIN_QUOTE_PAIR_IDS = ["usdt-ars"] as const;

export type AdminQuotePairId = (typeof ADMIN_QUOTE_PAIR_IDS)[number];

export type AdminQuotePairMeta = {
  id: AdminQuotePairId;
  label: string;
  base: string;
  quote: string;
};

export const ADMIN_QUOTE_PAIRS: readonly AdminQuotePairMeta[] = [
  {
    id: "usdt-ars",
    label: "USDT / ARS",
    base: "USDT",
    quote: "ARS",
  },
] as const;

export const DEFAULT_ADMIN_QUOTE_PAIR_ID: AdminQuotePairId = "usdt-ars";

export type AdminQuoteRateDto = {
  pairId: AdminQuotePairId;
  label: string;
  base: string;
  quote: string;
  rate: number | null;
  status: "available" | "unavailable";
  source: string | null;
  sourceDetail: string | null;
  fetchedAt: string | null;
  lastError: string | null;
  stale: boolean;
};

export function isAdminQuotePairId(value: string): value is AdminQuotePairId {
  return (ADMIN_QUOTE_PAIR_IDS as readonly string[]).includes(value);
}

export function getAdminQuotePairMeta(pairId: string): AdminQuotePairMeta {
  if (!isAdminQuotePairId(pairId)) {
    throw new Error(`Unknown quote pair: ${pairId}`);
  }
  const meta = ADMIN_QUOTE_PAIRS.find((pair) => pair.id === pairId);
  if (!meta) {
    throw new Error(`Unknown quote pair: ${pairId}`);
  }
  return meta;
}
