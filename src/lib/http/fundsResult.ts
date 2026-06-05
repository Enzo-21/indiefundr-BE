import type { FundsServiceResult } from "@/services/funds/estimate";
import { jsonError } from "./route";

export function toFundsResponse<T>(
  result: FundsServiceResult<T>,
  onSuccess: (data: T) => Response,
  defaultStatus = 200
): Response {
  if (!result.ok) {
    if (result.plainText && typeof result.body === "string") {
      return new Response(result.body, { status: result.status });
    }
    return jsonError(result.status, result.body);
  }
  const status = result.status ?? defaultStatus;
  return Response.json(result.data, { status });
}
