import { withAuth } from "@/lib/http/withAuth";
import { jsonError } from "@/lib/http/route";
import { getCurrentWithdrawalOrder } from "@/services/wallets/withdrawals";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const result = await getCurrentWithdrawalOrder(authUser.id);
    if (!result.ok) {
      return jsonError(result.status, result.body);
    }
    return Response.json(result.data);
  });
}
