import { AuthError, toAuthResponse } from "@/lib/auth/errors";
import { verifyAdminApiKey } from "@/lib/auth/verifyAdminApiKey";

export async function withAdmin(
  request: Request,
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    verifyAdminApiKey(request);
    return await handler();
  } catch (error) {
    if (error instanceof AuthError) {
      return toAuthResponse(error);
    }
    throw error;
  }
}
