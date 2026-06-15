const DEFAULT_APP_WEB_URL = "http://localhost:8081";
const DEFAULT_MARKETING_DOMAIN = "localhost:3000";

/** Dev-only path on the marketing host; middleware redirects to Expo on the same IP. */
export const DEV_LAN_APP_OPEN_PATH = "/__open-app";

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function getAppWebUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.APP_WEB_URL?.trim();
  if (configured) {
    return normalizeUrl(configured);
  }
  return DEFAULT_APP_WEB_URL;
}

export function getMarketingDomainFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  return env.MARKETING_DOMAIN?.trim() || DEFAULT_MARKETING_DOMAIN;
}

/** Hostname the Expo / web app is served from (redirect target). */
export function getAppWebUrl(): string {
  return getAppWebUrlFromEnv();
}

export function parseHostname(host: string | null): string {
  if (!host) return "";
  return host.split(":")[0]?.toLowerCase() ?? "";
}

export function parsePort(host: string | null, fallback = "3000"): string {
  if (!host) return fallback;
  const parts = host.split(":");
  return parts[1]?.trim() || fallback;
}

export function isPrivateLanIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return false;
  }
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isLocalDevMarketingHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/**
 * Expo redirect target for app-subdomain / LAN open-path requests.
 * In dev on a LAN IP, swaps localhost in APP_WEB_URL for the request IP.
 */
export function resolveAppRedirectTarget(
  requestHost: string | null,
  env: NodeJS.ProcessEnv = process.env
): string {
  const appWebUrl = getAppWebUrlFromEnv(env);
  if (env.NODE_ENV === "production") {
    return appWebUrl;
  }

  const hostname = parseHostname(requestHost);
  if (isPrivateLanIpv4(hostname)) {
    try {
      const target = new URL(appWebUrl);
      target.hostname = hostname;
      return normalizeUrl(target.toString());
    } catch {
      return appWebUrl;
    }
  }

  return appWebUrl;
}

export type AppOpenUrlOptions = {
  /** Request Host header, e.g. from headers() or window.location.host */
  host?: string | null;
};

/**
 * URL used by landing CTAs.
 * Dev localhost → app.localhost:{port} (middleware → APP_WEB_URL).
 * Dev LAN IP → same IP:{port}/__open-app (middleware → Expo on that IP).
 * Prod → https://app.{marketingDomain}.
 */
export function getAppOpenUrl(options?: AppOpenUrlOptions): string {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    const domain = getMarketingDomainFromEnv().split(":")[0];
    return `https://app.${domain}`;
  }

  const port = process.env.PORT?.trim() || "3000";
  const hostname = parseHostname(options?.host ?? null);

  if (isPrivateLanIpv4(hostname)) {
    const marketingPort = parsePort(options?.host ?? null, port);
    return `http://${hostname}:${marketingPort}${DEV_LAN_APP_OPEN_PATH}`;
  }

  return `http://app.localhost:${port}`;
}

export function isAppSubdomainHost(host: string | null): boolean {
  const hostname = parseHostname(host);
  if (!hostname) return false;
  if (hostname === "app.localhost") return true;

  const marketingHost = parseHostname(getMarketingDomainFromEnv());
  if (marketingHost && hostname === `app.${marketingHost}`) {
    return true;
  }
  return false;
}

export function isDevLocalOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (isLocalDevMarketingHost(hostname)) {
      return true;
    }
    if (hostname === "app.localhost") return true;
    if (isPrivateLanIpv4(hostname)) return true;
    const appWebHost = parseHostname(new URL(getAppWebUrlFromEnv()).host);
    return Boolean(appWebHost && hostname === appWebHost);
  } catch {
    return false;
  }
}

/** Origins allowed for API CORS in production (Vercel web app). */
export function getProductionCorsOrigins(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const origins = new Set<string>();
  const appWebUrl = getAppWebUrlFromEnv(env);
  if (appWebUrl) {
    try {
      origins.add(new URL(appWebUrl).origin);
    } catch {
      // ignore invalid APP_WEB_URL
    }
  }
  const marketingHost = parseHostname(getMarketingDomainFromEnv(env));
  if (marketingHost && !isLocalDevMarketingHost(marketingHost)) {
    origins.add(`https://app.${marketingHost}`);
  }
  return [...origins];
}

export function isProductionAppOrigin(
  origin: string | null,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!origin) return false;
  try {
    return getProductionCorsOrigins(env).includes(new URL(origin).origin);
  } catch {
    return false;
  }
}
