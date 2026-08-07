import {
  pickMaxAskFromCriptoYaPayload,
  type MaxAskResult,
} from "./criptoyaUsdtArs";

const CRIPTOYA_TIMEOUT_MS = 8_000;
const CRIPTOYA_USDT_ARS_URL = "https://criptoya.com/api/USDT/ARS/25";

export async function fetchCriptoYaUsdtArsMaxAsk(
  fetchImpl: typeof fetch = fetch
): Promise<MaxAskResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRIPTOYA_TIMEOUT_MS);
  try {
    const res = await fetchImpl(CRIPTOYA_USDT_ARS_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`CriptoYa HTTP ${res.status}`);
    }
    const json = (await res.json()) as unknown;
    const picked = pickMaxAskFromCriptoYaPayload(json);
    if (!picked) {
      throw new Error("CriptoYa response had no positive ask");
    }
    return picked;
  } finally {
    clearTimeout(timer);
  }
}

export { pickMaxAskFromCriptoYaPayload };
