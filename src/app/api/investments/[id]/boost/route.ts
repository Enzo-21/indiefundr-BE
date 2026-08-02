import { withAuth } from "@/lib/http/withAuth";
import { jsonError } from "@/lib/http/route";
import {
  activateBoostForInvestment,
  BoostActivationError,
} from "@/services/referrals/activateBoost";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  return withAuth(request, async (authUser) => {
    const { id } = await context.params;

    try {
      const data = await activateBoostForInvestment(authUser.id, id);
      return Response.json(data);
    } catch (err) {
      if (err instanceof BoostActivationError) {
        const status =
          err.code === "not_found"
            ? 404
            : err.code === "forbidden"
              ? 403
              : err.code === "power_unavailable"
                ? 403
                : 400;
        return jsonError(status, { msg: err.message, code: err.code });
      }
      throw err;
    }
  });
}
