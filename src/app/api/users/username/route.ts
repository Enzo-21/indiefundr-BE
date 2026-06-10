import { withAuth } from "@/lib/http/withAuth";
import { jsonError } from "@/lib/http/route";
import { serializeUser } from "@/lib/serializers/user";
import { updateUsername } from "@/services/users/username";

type Body = {
  username?: string;
};

export async function PATCH(request: Request) {
  return withAuth(request, async (authUser) => {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return jsonError(400, { msg: "Invalid JSON body" });
    }

    if (typeof body.username !== "string") {
      return jsonError(400, { msg: "username is required" });
    }

    const result = await updateUsername(authUser.id, body.username);
    if (!result.ok) {
      return jsonError(result.status, result.body);
    }

    return Response.json(serializeUser(result.user));
  });
}
