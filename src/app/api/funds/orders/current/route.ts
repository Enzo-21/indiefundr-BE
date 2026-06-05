import { withAuth } from "@/lib/http/withAuth";
import { toFundsResponse } from "@/lib/http/fundsResult";
import { getCurrentPurchaseOrder } from "@/services/funds/subscribe";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId") || "";
    const result = await getCurrentPurchaseOrder(authUser.id, fundId);
    return toFundsResponse(result, (data) => Response.json(data));
  });
}
