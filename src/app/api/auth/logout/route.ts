import { internalError, parseJsonBody } from "@/lib/http/route";
import { logoutBodySchema } from "@/lib/validators/auth";
import { logoutSession } from "@/services/auth/session";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const body = logoutBodySchema.safeParse(parsed.data);
  if (!body.success) {
    return internalError();
  }

  try {
    await logoutSession(body.data.refreshToken);
    return Response.json({ msg: "Logged out" });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return internalError();
  }
}
