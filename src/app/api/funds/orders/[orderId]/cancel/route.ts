import { withAuth } from "@/lib/http/withAuth";
import { toFundsResponse } from "@/lib/http/fundsResult";
import { cancelPurchaseOrder } from "@/services/funds/cancelPurchaseOrder";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function POST(request: Request, context: RouteContext) {
  return withAuth(request, async (authUser) => {
    const { orderId } = await context.params;
    const result = await cancelPurchaseOrder(authUser.id, orderId);
    return toFundsResponse(result, (data) => Response.json(data));
  });
}
