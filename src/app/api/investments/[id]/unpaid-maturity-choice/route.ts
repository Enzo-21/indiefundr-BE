import { withAuth } from "@/lib/http/withAuth";
import { jsonError } from "@/lib/http/route";
import {
  applyUnpaidMaturityChoice,
  type UnpaidMaturityChoice,
} from "@/services/investments/unpaidMaturityChoice";

type RouteContext = { params: Promise<{ id: string }> };

type Body = {
  choice?: UnpaidMaturityChoice;
  extensionDays?: number;
};

export async function POST(request: Request, context: RouteContext) {
  return withAuth(request, async (authUser) => {
    const { id } = await context.params;
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return jsonError(400, { msg: "Invalid JSON body" });
    }

    const result = await applyUnpaidMaturityChoice(
      authUser.id,
      id,
      body.choice ?? ("" as UnpaidMaturityChoice),
      body.extensionDays
    );

    if (!result.ok) {
      return jsonError(result.status, result.body);
    }

    return Response.json(result.data);
  });
}
