import { getEnv } from "@/lib/env";
import {
  getMarketingDomainFromEnv,
  normalizeMarketingDomain,
} from "@/lib/marketing/appUrl";

export function isMercadoPagoConfigured(
  env: ReturnType<typeof getEnv> = getEnv()
): boolean {
  return Boolean(env.mpAccessToken);
}

export function getMercadoPagoAccessToken(
  env: ReturnType<typeof getEnv> = getEnv()
): string {
  const token = env.mpAccessToken;
  if (!token) {
    throw new Error("Mercado Pago is not configured (MP_ACCESS_TOKEN)");
  }
  return token;
}

function isLocalOrPrivateHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0] ?? host;
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;
  return false;
}

/**
 * Mercado Pago requires public HTTPS back_urls / notification_url.
 * Local MARKETING_DOMAIN (localhost) falls back to staging or production hosts.
 */
export function resolveMercadoPagoPublicOrigin(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.MARKETING_DOMAIN?.trim() ?? "";
  const host = normalizeMarketingDomain(
    configured || getMarketingDomainFromEnv(env)
  );

  if (!isLocalOrPrivateHost(host)) {
    return `https://${host}`;
  }

  const dbUrl = env.DATABASE_URL ?? "";
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase() ?? "";
  const isProd =
    vercelEnv === "production" ||
    /\/production(\?|$)/.test(dbUrl) ||
    (env.NODE_ENV === "production" &&
      !/\/staging(\?|$)/.test(dbUrl) &&
      vercelEnv !== "preview");

  return isProd
    ? "https://indiefundr.com"
    : "https://staging.indiefundr.com";
}

/** Local/marketing origin (may be http://localhost). Prefer resolveMercadoPagoPublicOrigin for MP. */
export function getMarketingPublicOrigin(
  env: NodeJS.ProcessEnv = process.env
): string {
  const raw = getMarketingDomainFromEnv(env);
  const host = normalizeMarketingDomain(raw);
  if (host === "localhost" || host.startsWith("localhost:")) {
    const withPort = raw.includes(":") ? raw : `${host}:3000`;
    return `http://${withPort.replace(/^https?:\/\//, "")}`;
  }
  if (raw.includes("localhost")) {
    return raw.startsWith("http") ? raw.replace(/\/$/, "") : `http://${raw}`;
  }
  return `https://${host}`;
}

/**
 * API public origin for webhooks. Prefer request host when public;
 * otherwise Mercado Pago public origin (never localhost for MP).
 */
export function getApiPublicOrigin(
  request?: Request,
  env: NodeJS.ProcessEnv = process.env
): string {
  const proto = request?.headers.get("x-forwarded-proto");
  const host =
    request?.headers.get("x-forwarded-host") ?? request?.headers.get("host");
  if (host && !isLocalOrPrivateHost(host)) {
    const scheme = proto === "http" ? "http" : "https";
    return `${scheme}://${host}`;
  }
  return resolveMercadoPagoPublicOrigin(env);
}

export function getMercadoPagoBackUrls(env: NodeJS.ProcessEnv = process.env): {
  success: string;
  failure: string;
  pending: string;
} {
  const origin = resolveMercadoPagoPublicOrigin(env);
  return {
    success: `${origin}/payment/mercadopago/success`,
    failure: `${origin}/payment/mercadopago/failure`,
    pending: `${origin}/payment/mercadopago/pending`,
  };
}

export function getMercadoPagoNotificationUrl(
  request?: Request,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${getApiPublicOrigin(request, env)}/api/mercadopago/webhook`;
}
