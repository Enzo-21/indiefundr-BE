import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { getMercadoPagoAccessToken } from "./config";

const MP_API = "https://api.mercadopago.com";

export type MpPreferenceResult = {
  id: string;
  initPoint: string;
  sandboxInitPoint: string | null;
};

export type MpPreferencePayer = {
  email?: string | null;
  name?: string | null;
  surname?: string | null;
  registrationDate?: string | null;
  authenticationType?: string | null;
  isPrimeUser?: boolean | null;
  isFirstPurchaseOnline?: boolean | null;
  lastPurchase?: string | null;
};

export async function createCheckoutPreference(input: {
  title: string;
  description?: string;
  categoryId?: string;
  quantity: number;
  unitPriceArs: number;
  externalReference: string;
  payer?: MpPreferencePayer | null;
  /** @deprecated Prefer `payer.email` */
  payerEmail?: string | null;
  deviceId?: string | null;
  backUrls: { success: string; failure: string; pending: string };
  notificationUrl: string;
}): Promise<MpPreferenceResult> {
  const token = getMercadoPagoAccessToken();
  const payerInput = input.payer ?? {
    email: input.payerEmail ?? null,
  };

  const payer: Record<string, unknown> = {};
  if (payerInput.email) payer.email = payerInput.email;
  if (payerInput.name) payer.name = payerInput.name;
  if (payerInput.surname) payer.surname = payerInput.surname;
  if (payerInput.registrationDate) {
    payer.registration_date = payerInput.registrationDate;
    payer.date_created = payerInput.registrationDate;
  }
  if (payerInput.authenticationType) {
    payer.authentication_type = payerInput.authenticationType;
  }
  if (typeof payerInput.isPrimeUser === "boolean") {
    payer.is_prime_user = payerInput.isPrimeUser;
  }
  if (typeof payerInput.isFirstPurchaseOnline === "boolean") {
    payer.is_first_purchase_online = payerInput.isFirstPurchaseOnline;
  }
  if (payerInput.lastPurchase) {
    payer.last_purchase = payerInput.lastPurchase;
  }

  const body = {
    items: [
      {
        id: "indie-25",
        title: input.title,
        description: input.description ?? "IndieFundr credit",
        category_id: input.categoryId ?? "services",
        quantity: input.quantity,
        currency_id: "ARS",
        unit_price: input.unitPriceArs,
      },
    ],
    payer: Object.keys(payer).length > 0 ? payer : undefined,
    external_reference: input.externalReference,
    back_urls: input.backUrls,
    auto_return: "approved",
    notification_url: input.notificationUrl,
    statement_descriptor: "IndieFundr",
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const deviceId = input.deviceId?.trim();
  if (deviceId) {
    headers["X-meli-session-id"] = deviceId;
  }

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof json.message === "string"
        ? json.message
        : `Mercado Pago preference failed (${res.status})`;
    throw new Error(message);
  }

  const id = typeof json.id === "string" ? json.id : String(json.id ?? "");
  const initPoint =
    typeof json.init_point === "string" ? json.init_point : "";
  const sandboxInitPoint =
    typeof json.sandbox_init_point === "string" ? json.sandbox_init_point : null;

  if (!id || !initPoint) {
    throw new Error("Mercado Pago preference response missing id/init_point");
  }

  return { id, initPoint, sandboxInitPoint };
}

export type MpPayment = {
  id: string;
  status: string;
  externalReference: string | null;
  transactionAmount: number | null;
  /** Full Mercado Pago `/v1/payments/{id}` JSON body. */
  raw: Record<string, unknown>;
};

export async function fetchMercadoPagoPayment(
  paymentId: string
): Promise<MpPayment> {
  const token = getMercadoPagoAccessToken();
  const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof json.message === "string"
        ? json.message
        : `Failed to fetch MP payment ${paymentId}`
    );
  }

  return {
    id: String(json.id ?? paymentId),
    status: String(json.status ?? ""),
    externalReference:
      typeof json.external_reference === "string"
        ? json.external_reference
        : null,
    transactionAmount:
      typeof json.transaction_amount === "number"
        ? json.transaction_amount
        : null,
    raw: json,
  };
}

/**
 * Verify webhook x-signature when MP_WEBHOOK_SECRET is set.
 * See https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks
 */
export function verifyMercadoPagoWebhookSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  const secret = getEnv().mpWebhookSecret;
  if (!secret) {
    // No secret configured — accept (dev); warn in logs at call site.
    return true;
  }
  if (!input.xSignature || !input.dataId) {
    return false;
  }

  const parts = Object.fromEntries(
    input.xSignature.split(",").map((part) => {
      const [k, v] = part.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    })
  );
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;

  const manifest = `id:${input.dataId};request-id:${input.xRequestId ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Split a display name into first / remaining surname for MP payer fields. */
export function splitPayerName(fullName: string | null | undefined): {
  name: string | null;
  surname: string | null;
} {
  const trimmed = fullName?.trim() ?? "";
  if (!trimmed) {
    return { name: null, surname: null };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { name: parts[0] ?? null, surname: null };
  }
  return {
    name: parts[0] ?? null,
    surname: parts.slice(1).join(" ") || null,
  };
}
