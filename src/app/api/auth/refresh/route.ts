import { jsonError, parseJsonBody, validationErrors } from "@/lib/http/route";
import { refreshBodySchema } from "@/lib/validators/auth";
import { refreshSession } from "@/services/auth/session";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const body = refreshBodySchema.safeParse(parsed.data);
  if (!body.success) {
    return jsonError(400, validationErrors(body.error));
  }

  const result = await refreshSession(body.data.refreshToken);
  if (!result.ok) {
    const payload: Record<string, unknown> = { msg: result.msg };
    if (result.code) payload.code = result.code;
    return jsonError(result.status, payload);
  }

  return Response.json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  });
}
