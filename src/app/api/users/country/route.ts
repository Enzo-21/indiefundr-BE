import { withAuth } from "@/lib/http/withAuth";
import { jsonError } from "@/lib/http/route";
import { serializeUser } from "@/lib/serializers/user";
import { updateCountry } from "@/services/users/country";

type Body = {
  country?: unknown;
};

export async function PATCH(request: Request) {
  return withAuth(request, async (authUser) => {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return jsonError(400, { msg: "Invalid JSON body" });
    }

    if (!("country" in body)) {
      return jsonError(400, { msg: "country is required" });
    }

    const result = await updateCountry(authUser.id, body.country);
    if (!result.ok) {
      return jsonError(result.status, result.body);
    }

    return Response.json(serializeUser(result.user));
  });
}
