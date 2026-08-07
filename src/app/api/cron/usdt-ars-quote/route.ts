import { authorizeCronRequest } from "@/lib/cron/authorizeCronRequest";
import { refreshUsdtArsQuote } from "@/services/quotes/refreshUsdtArsQuote";

export const maxDuration = 30;

export async function GET(request: Request) {
  if (!authorizeCronRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const result = await refreshUsdtArsQuote();

  return Response.json({
    ok: result.ok,
    result,
    startedAt,
    finishedAt: new Date().toISOString(),
  });
}
