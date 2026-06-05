import { withAuth } from "@/lib/http/withAuth";
import { toUserResponse } from "@/lib/http/userResult";
import { internalError } from "@/lib/http/route";
import { welcomeUser } from "@/services/users/user";

export async function PUT(request: Request) {
  return withAuth(request, async (authUser) => {
    try {
      const result = await welcomeUser(authUser.id);
      return toUserResponse(result, (message) => Response.json(message));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return internalError();
    }
  });
}
