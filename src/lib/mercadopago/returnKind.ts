export type MercadoPagoFailureReturnKind = "failed" | "dismiss";

const FAILED_STATUSES = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "refunded",
]);

const NON_FAILURE_STATUSES = new Set(["approved", "pending", "in_process", "authorized"]);

function normalizeStatus(value: string | null | undefined): string {
  if (value == null) return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") {
    return "";
  }
  return trimmed;
}

function firstParam(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string
): string | null {
  if (params instanceof URLSearchParams) {
    return params.get(key);
  }
  const raw = params[key];
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw ?? null;
}

/**
 * Checkout Pro `back_urls.failure` is used for both real rejections and
 * "Volver a la tienda" / abandon. Discriminate via return query params.
 */
export function resolveMercadoPagoFailureReturn(
  params: URLSearchParams | Record<string, string | string[] | undefined>
): MercadoPagoFailureReturnKind {
  const status = normalizeStatus(
    firstParam(params, "status") ?? firstParam(params, "collection_status")
  );

  if (FAILED_STATUSES.has(status)) {
    return "failed";
  }

  if (NON_FAILURE_STATUSES.has(status)) {
    return "dismiss";
  }

  // No status / null / empty — typical abandon or "return to store".
  return "dismiss";
}
