import { getEnv } from "@/lib/env";

export type TransakRuntimeConfig = {
  env: "staging" | "production";
  apiKey: string;
  apiSecret: string;
  referrerDomain: string;
  partnerApiBaseUrl: string;
  gatewayApiBaseUrl: string;
};

export function isTransakConfigured(source?: NodeJS.ProcessEnv): boolean {
  const { transakApiKey, transakApiSecret } = getEnv(source);
  return Boolean(transakApiKey && transakApiSecret);
}

export function getTransakConfig(source?: NodeJS.ProcessEnv): TransakRuntimeConfig {
  const env = getEnv(source);
  const isProduction = env.transakEnv === "production";

  return {
    env: env.transakEnv,
    apiKey: env.transakApiKey,
    apiSecret: env.transakApiSecret,
    referrerDomain: env.transakReferrerDomain || env.mailingDomain,
    partnerApiBaseUrl: isProduction
      ? "https://api.transak.com"
      : "https://api-stg.transak.com",
    gatewayApiBaseUrl: isProduction
      ? "https://api-gateway.transak.com"
      : "https://api-gateway-stg.transak.com",
  };
}
