import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { AuthError } from "./errors";
import { ADMIN_SESSION_COOKIE } from "./adminSessionCookie";

export { ADMIN_SESSION_COOKIE };
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type AdminSessionPayload = {
  sub: "admin";
  email: string;
  createdBy: string;
  exp: number;
};

function getSessionSecret(): string {
  const secret = getEnv().jwtAccessSecret?.trim() ?? "";
  if (!secret) {
    throw new AuthError(
      503,
      "ADMIN_NOT_CONFIGURED",
      "Admin API is not configured"
    );
  }
  return secret;
}

function assertAdminSessionConfigured(): void {
  const allowedEmail = getEnv().adminAllowedEmail?.trim() ?? "";
  if (!allowedEmail) {
    throw new AuthError(
      503,
      "ADMIN_NOT_CONFIGURED",
      "Admin dashboard is not configured"
    );
  }
}

function assertAdminApiKeyConfigured(): void {
  const configuredKey = getEnv().adminApiKey?.trim() ?? "";
  if (!configuredKey) {
    throw new AuthError(
      503,
      "ADMIN_NOT_CONFIGURED",
      "Admin API is not configured"
    );
  }
}

function signPayload(payload: AdminSessionPayload): string {
  const secret = getSessionSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function parseAdminSessionToken(
  token: string | undefined | null
): AdminSessionPayload {
  assertAdminSessionConfigured();

  if (!token?.trim()) {
    throw new AuthError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const [body, sig] = token.split(".");
  if (!body || !sig) {
    throw new AuthError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const expected = createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new AuthError(401, "UNAUTHORIZED", "Unauthorized");
  }

  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as AdminSessionPayload;
  } catch {
    throw new AuthError(401, "UNAUTHORIZED", "Unauthorized");
  }

  if (
    payload.sub !== "admin" ||
    typeof payload.exp !== "number" ||
    typeof payload.email !== "string"
  ) {
    throw new AuthError(401, "UNAUTHORIZED", "Unauthorized");
  }

  if (payload.exp < Date.now()) {
    throw new AuthError(401, "UNAUTHORIZED", "Unauthorized");
  }

  return payload;
}

export function createAdminSessionToken({
  email,
  createdBy,
}: {
  email: string;
  createdBy?: string;
}): string {
  assertAdminSessionConfigured();
  getSessionSecret();

  const normalizedEmail = email.trim().toLowerCase();
  const payload: AdminSessionPayload = {
    sub: "admin",
    email: normalizedEmail,
    createdBy: createdBy?.trim() || normalizedEmail,
    exp: Date.now() + SESSION_TTL_MS,
  };
  return signPayload(payload);
}

export async function createAdminSession({
  email,
  createdBy,
}: {
  email: string;
  createdBy?: string;
}): Promise<void> {
  const token = createAdminSessionToken({ email, createdBy });
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function verifyAdminSession(): Promise<AdminSessionPayload> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return parseAdminSessionToken(token);
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export function verifyAdminApiKeyValue(provided: string): void {
  assertAdminApiKeyConfigured();
  const configured = getEnv().adminApiKey.trim();
  const providedBuf = Buffer.from(provided);
  const configuredBuf = Buffer.from(configured);
  if (
    providedBuf.length !== configuredBuf.length ||
    !timingSafeEqual(providedBuf, configuredBuf)
  ) {
    throw new AuthError(401, "UNAUTHORIZED", "Unauthorized");
  }
}
