import { withAuth } from "@/lib/http/withAuth";
import { toFundsResponse } from "@/lib/http/fundsResult";
import { getSubscribeFeeEstimate } from "@/services/funds/estimate";
import { extractBodySummary, logFundsEvent } from "@/services/funds/logging";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId") || "";

    if (!fundId) {
      logFundsEvent("api_estimate", "warn", "validation failed", {
        userId: authUser.id,
        reason: "missing_fund_id",
      });
    }

    const result = await getSubscribeFeeEstimate(authUser.id, fundId);

    if (!result.ok) {
      logFundsEvent("api_estimate", "warn", "handler rejected", {
        userId: authUser.id,
        fundId,
        status: result.status,
        ...extractBodySummary(result.body),
      });
    }

    return toFundsResponse(result, (data) => Response.json(data));
  });
}
