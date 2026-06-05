import { jsonError, parseJsonBody, validationErrors } from "@/lib/http/route";
import { emailBodySchema } from "@/lib/validators/auth";
import { resendPasswordlessOtp } from "@/services/auth/passwordless";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const body = emailBodySchema.safeParse(parsed.data);
  if (!body.success) {
    return jsonError(400, validationErrors(body.error));
  }

  const result = await resendPasswordlessOtp(body.data.email);
  if (!result.ok) {
    const payload: Record<string, unknown> = { msg: result.msg };
    if (result.retryAfterSeconds !== undefined) {
      payload.retryAfterSeconds = result.retryAfterSeconds;
    }
    return jsonError(result.status, payload);
  }

  return Response.json({ msg: result.msg });
}
