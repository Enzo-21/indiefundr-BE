import { getTransakConfig } from "./config";
import { getTransakPartnerAccessToken } from "./partnerAccessToken";

export type TransakWidgetSessionInput = {
  walletAddress: string;
  partnerCustomerId: string;
  email?: string | null;
};

export type TransakWidgetSessionResult = {
  widgetUrl: string;
};

type WidgetSessionResponse = {
  data?: {
    widgetUrl?: string;
  };
  error?: { message?: string };
};

export async function createTransakWidgetSession(
  input: TransakWidgetSessionInput
): Promise<TransakWidgetSessionResult> {
  const config = getTransakConfig();
  const accessToken = await getTransakPartnerAccessToken();

  const widgetParams: Record<string, string | boolean> = {
    apiKey: config.apiKey,
    referrerDomain: config.referrerDomain,
    productsAvailed: "BUY",
    cryptoCurrencyCode: "USDT",
    network: "tron",
    walletAddress: input.walletAddress,
    disableWalletAddressForm: true,
    partnerCustomerId: input.partnerCustomerId,
  };

  if (input.email) {
    widgetParams.email = input.email;
  }

  const response = await fetch(
    `${config.gatewayApiBaseUrl}/api/v2/auth/session`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "access-token": accessToken,
      },
      body: JSON.stringify({ widgetParams }),
    }
  );

  const payload = (await response.json()) as WidgetSessionResponse;
  if (!response.ok) {
    const message =
      payload.error?.message ??
      `Transak create widget session failed (${response.status})`;
    throw new Error(message);
  }

  const widgetUrl = payload.data?.widgetUrl;
  if (!widgetUrl) {
    throw new Error("Transak create widget session response missing widgetUrl");
  }

  return { widgetUrl };
}
