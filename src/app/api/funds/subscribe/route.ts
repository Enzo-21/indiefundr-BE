import { withAuth } from "@/lib/http/withAuth";
import { toFundsResponse } from "@/lib/http/fundsResult";
import {
  jsonError,
  parseJsonBody,
  validationErrors,
} from "@/lib/http/route";
import { subscribeBodySchema } from "@/lib/validators/funds";
import { subscribeToFund } from "@/services/funds/subscribe";
import { extractBodySummary, logFundsEvent } from "@/services/funds/logging";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) {
      logFundsEvent("api_subscribe", "warn", "invalid json", {
        userId: authUser.id,
        reason: "invalid_json",
      });
      return parsed.response;
    }

    const body = subscribeBodySchema.safeParse(parsed.data);
    if (!body.success) {
      logFundsEvent("api_subscribe", "warn", "validation failed", {
        userId: authUser.id,
        reason: "validation_failed",
        issues: body.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return jsonError(400, validationErrors(body.error));
    }

    const result = await subscribeToFund(authUser.id, body.data);

    if (!result.ok) {
      logFundsEvent("api_subscribe", "warn", "handler rejected", {
        userId: authUser.id,
        fundId: body.data.fundId,
        cost: body.data.cost,
        status: result.status,
        ...extractBodySummary(result.body),
      });
    }

    return toFundsResponse(result, (data) => Response.json(data), 202);
  });
}
