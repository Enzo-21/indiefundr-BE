import { withAuth } from "@/lib/http/withAuth";
import { toUserResponse } from "@/lib/http/userResult";
import { internalError } from "@/lib/http/route";
import { serializeUser } from "@/lib/serializers/user";
import { getUserForAuth } from "@/services/users/user";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    try {
      const result = await getUserForAuth(authUser.id);
      return toUserResponse(result, (user) =>
        Response.json(serializeUser(user))
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return internalError();
    }
  });
}
