import type { WalletServiceResult } from "@/services/wallets/wallets";
import { jsonError } from "./route";

export function toWalletResponse<T>(
  result: WalletServiceResult<T>,
  onSuccess: (data: T) => Response,
  successStatus = 200
): Response {
  if (!result.ok) {
    if (result.plainText && typeof result.body === "string") {
      return new Response(result.body, { status: result.status });
    }
    return jsonError(result.status, result.body);
  }
  return Response.json(result.data, { status: successStatus });
}
