import { jsonError, parseJsonBody, validationErrors } from "@/lib/http/route";
import { verifyBodySchema } from "@/lib/validators/auth";
import { verifyPasswordlessAuth } from "@/services/auth/passwordless";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const body = verifyBodySchema.safeParse(parsed.data);
  if (!body.success) {
    return jsonError(400, validationErrors(body.error));
  }

  const userAgent = request.headers.get("user-agent");
  const result = await verifyPasswordlessAuth(
    body.data.email,
    body.data.otpCode,
    userAgent
  );

  if (!result.ok) {
    if (result.errors) {
      return jsonError(result.status, { errors: result.errors });
    }
    return jsonError(result.status, { msg: result.msg ?? "Internal Server Error" });
  }

  return Response.json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  });
}
