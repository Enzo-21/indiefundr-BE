import { getAdminQuotePairMeta } from "@/services/quotes/adminQuotePairRegistry";
import { getAdminQuoteRate } from "@/services/quotes/adminQuoteRates";
import { refreshUsdtArsQuote } from "@/services/quotes/refreshUsdtArsQuote";
import type { AdminQuoteRateDto } from "@/services/quotes/adminQuotePairRegistry";

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
