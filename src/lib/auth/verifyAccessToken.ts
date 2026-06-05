import jwt from "jsonwebtoken";
import { getEnv } from "@/lib/env";
import { AuthError } from "./errors";

export type AuthUser = { id: string };

export function verifyAccessToken(token: string | null | undefined): AuthUser {
  if (!token) {
    throw new AuthError(
      401,
      "NO_TOKEN",
      "No token available. Authorization denied"
    );
  }

  try {
    const decoded = jwt.verify(token, getEnv().jwtAccessSecret) as {
      user?: { id?: string };
    };
    const id = decoded.user?.id;
    if (!id) {
      throw new AuthError(401, "INVALID_TOKEN", "Invalid token");
    }
    return { id: String(id) };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthError(401, "TOKEN_EXPIRED", "Access token expired");
    }
    throw new AuthError(401, "INVALID_TOKEN", "Invalid token");
  }
}
