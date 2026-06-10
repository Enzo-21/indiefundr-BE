import { getTransakConfig } from "./config";

type CachedPartnerToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: CachedPartnerToken | null = null;

type RefreshTokenResponse = {
  data?: {
    accessToken?: string;
    expiresAt?: number;
  };
  error?: { message?: string };
};

export async function getTransakPartnerAccessToken(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > nowSec + 120) {
    return cachedToken.accessToken;
  }

  const config = getTransakConfig();
  const response = await fetch(
    `${config.partnerApiBaseUrl}/partners/api/v2/refresh-token`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-secret": config.apiSecret,
      },
      body: JSON.stringify({ apiKey: config.apiKey }),
    }
  );

  const payload = (await response.json()) as RefreshTokenResponse;
  if (!response.ok) {
    const message =
      payload.error?.message ??
      `Transak refresh-token failed (${response.status})`;
    throw new Error(message);
  }

  const accessToken = payload.data?.accessToken;
  const expiresAt = payload.data?.expiresAt;
  if (!accessToken || !expiresAt) {
    throw new Error("Transak refresh-token response missing accessToken");
  }

  cachedToken = { accessToken, expiresAt };
  return accessToken;
}

/** Clears in-memory token cache (for tests). */
export function resetTransakPartnerAccessTokenCache(): void {
  cachedToken = null;
}
