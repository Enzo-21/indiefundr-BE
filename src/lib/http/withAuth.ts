import { AuthError, toAuthResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/requireUser";
import type { AuthUser } from "@/lib/auth/verifyAccessToken";

export async function withAuth(
  request: Request,
  handler: (user: AuthUser) => Promise<Response>
): Promise<Response> {
  try {
    const user = requireUser(request);
    return await handler(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return toAuthResponse(error);
    }
    throw error;
  }
}
