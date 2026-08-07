import { jsonError } from "@/lib/http/route";
import { withAdminSession } from "@/lib/http/withAdminSession";
import {
  getAdminQuoteRate,
  isAdminQuotePairId,
} from "@/services/quotes/adminQuoteRates";

type RouteContext = {
  params: Promise<{ pairId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  return withAdminSession(async () => {
    const { pairId } = await context.params;
    if (!isAdminQuotePairId(pairId)) {
      return jsonError(400, {
        ok: false,
        error: { code: "INVALID_PAIR", msg: `Unknown quote pair: ${pairId}` },
      });
    }

    try {
      const data = await getAdminQuoteRate(pairId);
      return Response.json({ ok: true, data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return jsonError(500, {
        ok: false,
        error: { code: "QUOTE_READ_FAILED", msg },
      });
    }
  });
}
