import { withAuth } from "@/lib/http/withAuth";
import { jsonError } from "@/lib/http/route";
import { isValidObjectId } from "@/lib/validators/objectId";
import { getWithdrawalOrderById } from "@/services/wallets/withdrawals";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function GET(request: Request, context: RouteContext) {
  return withAuth(request, async (authUser) => {
    const { orderId } = await context.params;
    if (!isValidObjectId(orderId)) {
      return jsonError(400, { msg: "Invalid withdrawal order id" });
    }

    const result = await getWithdrawalOrderById(authUser.id, orderId);
    if (!result.ok) {
      return jsonError(result.status, result.body);
    }
    return Response.json(result.data);
  });
}
