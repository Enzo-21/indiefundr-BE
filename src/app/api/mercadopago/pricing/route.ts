import { withAuth } from "@/lib/http/withAuth";
import { jsonError } from "@/lib/http/route";
import { buildUsdtPurchasePricing } from "@/lib/config/usdtPurchasePricing";
import { getUsdtArsQuoteForPurchase } from "@/services/quotes/refreshUsdtArsQuote";

const QUOTE_UNAVAILABLE_MSG =
  "USDT pricing is temporarily unavailable. Please try again in a few minutes.";

/** Authenticated quote for the fixed AR Mercado Pago USDT pack. */
export async function GET(request: Request) {
  return withAuth(request, async () => {
    const quote = await getUsdtArsQuoteForPurchase();
    if (!quote.ok) {
      return jsonError(503, {
        code: "quote_unavailable",
        msg: QUOTE_UNAVAILABLE_MSG,
        reason: quote.reason,
      });
    }

    return Response.json({
      pricing: buildUsdtPurchasePricing({ arsPerUsdt: quote.arsPerUsdt }),
      quote: {
        source: quote.source,
        sourceDetail: quote.sourceDetail,
        fetchedAt: quote.fetchedAt.toISOString(),
      },
    });
  });
}
