import { buildSiteConfig } from "@/lib/content";
import { getEnv } from "@/lib/env";

/** Email clients require absolute image URLs. */
export function resolveMailingLogoUrl(): string {
  const siteUrl = buildSiteConfig().url;
  const configured = getEnv().mailingLogoUrl.trim();
  if (!configured) {
    return new URL("/images/indiefundr-logo-192.png", siteUrl).href;
  }
  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    return configured;
  }
  const path = configured.startsWith("/") ? configured : `/${configured}`;
  const marketingDomain = getEnv().marketingDomain.trim();
  const base = marketingDomain
    ? marketingDomain.startsWith("http")
      ? marketingDomain
      : `https://${marketingDomain}`
    : siteUrl;
  return new URL(path, base.endsWith("/") ? base : `${base}/`).href;
}
