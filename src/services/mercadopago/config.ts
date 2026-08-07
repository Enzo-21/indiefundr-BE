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

/**
 * User-facing MP checkout is staging/testnet only.
 * Production (mainnet or production DB) shows Coming soon in the app.
 */
export function isMercadoPagoCheckoutEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const network = env.BLOCKCHAIN_NETWORK?.trim().toLowerCase();
  const dbUrl = env.DATABASE_URL ?? "";
  if (network === "mainnet" || /\/production(\?|$)/.test(dbUrl)) {
    return false;
  }
  return true;
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

/** Same production detection used for MP public origins / external_reference tags. */
export function isMercadoPagoProductionEnv(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const dbUrl = env.DATABASE_URL ?? "";
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase() ?? "";
  return (
    vercelEnv === "production" ||
    /\/production(\?|$)/.test(dbUrl) ||
    (env.NODE_ENV === "production" &&
      !/\/staging(\?|$)/.test(dbUrl) &&
      vercelEnv !== "preview")
  );
}

export type MercadoPagoEnvTag = "stg" | "prod";

export function getMercadoPagoEnvTag(
  env: NodeJS.ProcessEnv = process.env
): MercadoPagoEnvTag {
  return isMercadoPagoProductionEnv(env) ? "prod" : "stg";
}

export function buildMercadoPagoExternalReference(
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now()
): string {
  return `mp_${getMercadoPagoEnvTag(env)}_${userId}_${nowMs}`;
}

/** Staging-tagged refs should be forwarded when a forward URL is configured (prod). */
export function shouldForwardMercadoPagoWebhook(input: {
  externalReference: string | null | undefined;
  forwardUrl?: string | null;
}): boolean {
  const ref = input.externalReference?.trim() ?? "";
  const forwardUrl = input.forwardUrl?.trim() ?? "";
  if (!forwardUrl) return false;
  return ref.startsWith("mp_stg_");
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

  return isMercadoPagoProductionEnv(env)
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
