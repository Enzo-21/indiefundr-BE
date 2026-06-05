import { toUserResponse } from "@/lib/http/userResult";
import { serializeUser } from "@/lib/serializers/user";
import { getUserById } from "@/services/users/user";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = await getUserById(id);
  return toUserResponse(result, (user) => Response.json(serializeUser(user)));
}
