import {
  AuthError,
  toAuthResponse,
} from "@/lib/auth/errors";
import {
  verifyAdminSession,
  type AdminSessionPayload,
} from "@/lib/auth/adminSession";

/** Cookie-session auth for admin dashboard UI → Route Handlers. */
export async function withAdminSession(
  handler: (session: AdminSessionPayload) => Promise<Response>
): Promise<Response> {
  try {
    const session = await verifyAdminSession();
    return await handler(session);
  } catch (error) {
    if (error instanceof AuthError) {
      return toAuthResponse(error);
    }
    throw error;
  }
}
