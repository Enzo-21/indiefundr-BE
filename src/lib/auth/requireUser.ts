import { getAuthTokenFromRequest } from "./errors";
import { verifyAccessToken, type AuthUser } from "./verifyAccessToken";

export function requireUser(request: Request): AuthUser {
  const token = getAuthTokenFromRequest(request);
  return verifyAccessToken(token);
}
