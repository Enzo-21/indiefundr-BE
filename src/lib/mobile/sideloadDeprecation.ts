const STAGING_PREVIEW_CHANNEL = "staging-preview";

const DEFAULT_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.indiefundr.app";

export type AppConfigResponse = {
  sideloadDeprecated: boolean;
  playStoreUrl: string;
};

export function getPlayStoreUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  return env.PLAY_STORE_URL?.trim() || DEFAULT_PLAY_STORE_URL;
}

export function isSideloadDeprecated(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = env.SIDELOAD_DEPRECATED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function getAppConfig(
  env: NodeJS.ProcessEnv = process.env
): AppConfigResponse {
  return {
    sideloadDeprecated: isSideloadDeprecated(env),
    playStoreUrl: getPlayStoreUrl(env),
  };
}

export const SIDELOAD_SENSITIVE_API_PREFIXES = [
  "/api/funds/subscribe",
  "/api/wallets/withdrawals",
  "/api/investments/",
  "/api/referrals/redeem",
  "/api/referrals/redemption",
] as const;

export function isSideloadSensitiveApiPath(pathname: string): boolean {
  return SIDELOAD_SENSITIVE_API_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) {
      return pathname.startsWith(prefix);
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

export function shouldBlockSideloadRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!isSideloadDeprecated(env)) return false;

  const channel = request.headers.get("x-app-channel")?.trim();
  if (channel !== STAGING_PREVIEW_CHANNEL) return false;

  const pathname = new URL(request.url).pathname;
  return isSideloadSensitiveApiPath(pathname);
}

export { STAGING_PREVIEW_CHANNEL };
