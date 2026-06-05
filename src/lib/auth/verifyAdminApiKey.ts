import { getEnv } from "@/lib/env";
import { AuthError } from "./errors";

export function getAdminApiKeyFromRequest(request: Request): string | null {
  const headerKey = request.headers.get("x-admin-api-key")?.trim();
  if (headerKey) return headerKey;

  const auth = request.headers.get("authorization");
  if (auth) {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

export function verifyAdminApiKey(request: Request): void {
  const configuredKey = getEnv().adminApiKey?.trim() ?? "";
  if (!configuredKey) {
    throw new AuthError(503, "ADMIN_NOT_CONFIGURED", "Admin API is not configured");
  }

  const provided = getAdminApiKeyFromRequest(request);
  if (!provided || provided !== configuredKey) {
    throw new AuthError(401, "UNAUTHORIZED", "Unauthorized");
  }
}
