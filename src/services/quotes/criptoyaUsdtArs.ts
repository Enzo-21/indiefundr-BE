/** Pure helpers for CriptoYa USDT/ARS quote selection. */

export type CriptoYaExchangeQuote = {
  ask?: unknown;
  bid?: unknown;
  totalAsk?: unknown;
  totalBid?: unknown;
  time?: unknown;
};

export type MaxAskResult = {
  arsPerUsdt: number;
  exchangeKey: string;
};

export function pickMaxAskFromCriptoYaPayload(
  payload: unknown
): MaxAskResult | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  let best: MaxAskResult | null = null;
  for (const [exchangeKey, raw] of Object.entries(
    payload as Record<string, CriptoYaExchangeQuote>
  )) {
    if (!raw || typeof raw !== "object") continue;
    const ask = typeof raw.ask === "number" ? raw.ask : Number(raw.ask);
    if (!Number.isFinite(ask) || ask <= 0) continue;
    if (!best || ask > best.arsPerUsdt) {
      best = { arsPerUsdt: ask, exchangeKey };
    }
  }
  return best;
}
