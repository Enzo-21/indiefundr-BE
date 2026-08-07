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

/** Public origin for marketing back_urls (landing host). */
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
 * API public origin for webhooks. Prefer request host when available;
 * otherwise marketing domain (Next.js hosts both marketing + API).
 */
export function getApiPublicOrigin(
  request?: Request,
  env: NodeJS.ProcessEnv = process.env
): string {
  const proto = request?.headers.get("x-forwarded-proto");
  const host = request?.headers.get("x-forwarded-host") ?? request?.headers.get("host");
  if (host) {
    const scheme = proto === "http" ? "http" : "https";
    if (host.includes("localhost") || /^\d+\.\d+\.\d+\.\d+/.test(host)) {
      return `http://${host}`;
    }
    return `${scheme}://${host}`;
  }
  return getMarketingPublicOrigin(env);
}

export function getMercadoPagoBackUrls(env: NodeJS.ProcessEnv = process.env): {
  success: string;
  failure: string;
  pending: string;
} {
  const origin = getMarketingPublicOrigin(env);
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
