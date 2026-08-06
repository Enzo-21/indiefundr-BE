import { withAuth } from "@/lib/http/withAuth";
import { buildUsdtPurchasePricing } from "@/lib/config/usdtPurchasePricing";

/** Authenticated quote for the fixed AR Mercado Pago USDT pack. */
export async function GET(request: Request) {
  return withAuth(request, async () => {
    return Response.json({ pricing: buildUsdtPurchasePricing() });
  });
}
