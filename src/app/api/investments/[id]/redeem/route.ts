import { withAuth } from "@/lib/http/withAuth";
import { jsonError } from "@/lib/http/route";
import { redeemInvestment } from "@/services/investments/investments";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  return withAuth(request, async (authUser) => {
    const { id } = await context.params;
    const result = await redeemInvestment(authUser.id, id);
    if (!result.ok) {
      if (typeof result.body === "string") {
        return jsonError(result.status, { msg: result.body });
      }
      return jsonError(result.status, result.body);
    }
    return Response.json(result.data);
  });
}
