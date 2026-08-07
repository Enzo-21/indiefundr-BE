import { jsonError } from "@/lib/http/route";
import { withAdminSession } from "@/lib/http/withAdminSession";
import { isAdminQuotePairId } from "@/services/quotes/adminQuotePairRegistry";
import { refreshAdminQuoteRate } from "@/services/quotes/adminQuoteRateRefresh";

export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ pairId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  return withAdminSession(async () => {
    const { pairId } = await context.params;
    if (!isAdminQuotePairId(pairId)) {
      return jsonError(400, {
        ok: false,
        error: { code: "INVALID_PAIR", msg: `Unknown quote pair: ${pairId}` },
      });
    }

    try {
      const data = await refreshAdminQuoteRate(pairId);
      return Response.json({ ok: true, data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return Response.json(
        {
          ok: false,
          error: { code: "QUOTE_REFRESH_FAILED", msg },
        },
        { status: 502 }
      );
    }
  });
}
