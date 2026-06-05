export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly msg: string
  ) {
    super(msg);
    this.name = "AuthError";
  }
}

export function toAuthResponse(error: AuthError): Response {
  return Response.json(
    { msg: error.msg, code: error.code },
    { status: error.status }
  );
}

export const AUTH_HEADER = "x-auth-token";

export function getAuthTokenFromRequest(request: Request): string | null {
  const token = request.headers.get(AUTH_HEADER);
  return token?.trim() || null;
}
