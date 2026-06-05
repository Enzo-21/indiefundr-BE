import { withAuth } from "@/lib/http/withAuth";
import { toFundsResponse } from "@/lib/http/fundsResult";
import { getPurchaseOrderById } from "@/services/funds/subscribe";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function GET(request: Request, context: RouteContext) {
  return withAuth(request, async (authUser) => {
    const { orderId } = await context.params;
    const result = await getPurchaseOrderById(authUser.id, orderId);
    return toFundsResponse(result, (data) => Response.json(data));
  });
}
