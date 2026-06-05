import { ZodError } from "zod";

export function jsonError(
  status: number,
  body: Record<string, unknown> | string
): Response {
  return Response.json(body, { status });
}

export function internalError(): Response {
  return jsonError(500, { msg: "Internal Server Error" });
}

export function validationErrors(error: ZodError): {
  errors: { msg: string }[];
} {
  return {
    errors: error.issues.map((issue) => ({
      msg: issue.message,
    })),
  };
}

export async function parseJsonBody(
  request: Request
): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  try {
    const data = await request.json();
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: jsonError(400, { msg: "Invalid JSON" }),
    };
  }
}
