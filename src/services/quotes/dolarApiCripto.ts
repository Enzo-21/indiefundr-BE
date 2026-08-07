const DOLARAPI_TIMEOUT_MS = 8_000;
const DOLARAPI_CRIPTO_URL = "https://dolarapi.com/v1/dolares/cripto";

export type DolarApiCriptoQuote = {
  arsPerUsdt: number;
};

export function parseDolarApiCriptoVenta(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const venta = (payload as { venta?: unknown }).venta;
  const n = typeof venta === "number" ? venta : Number(venta);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function fetchDolarApiCriptoVenta(
  fetchImpl: typeof fetch = fetch
): Promise<DolarApiCriptoQuote> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOLARAPI_TIMEOUT_MS);
  try {
    const res = await fetchImpl(DOLARAPI_CRIPTO_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`DolarAPI HTTP ${res.status}`);
    }
    const json = (await res.json()) as unknown;
    const venta = parseDolarApiCriptoVenta(json);
    if (venta == null) {
      throw new Error("DolarAPI cripto response missing positive venta");
    }
    return { arsPerUsdt: venta };
  } finally {
    clearTimeout(timer);
  }
}
