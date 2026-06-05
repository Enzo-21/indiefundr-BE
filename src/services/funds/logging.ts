export type FundsLogScope =
  | "subscribe"
  | "estimate"
  | "api_subscribe"
  | "api_estimate";

const PREFIX: Record<FundsLogScope, string> = {
  subscribe: "[subscribeToFund]",
  estimate: "[subscribeEstimate]",
  api_subscribe: "[api/funds/subscribe]",
  api_estimate: "[api/funds/estimate]",
};

export function logFundsEvent(
  scope: FundsLogScope,
  level: "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>
): void {
  const prefix = PREFIX[scope];
  const payload =
    fields && Object.keys(fields).length > 0
      ? { message, ...fields }
      : { message };

  if (level === "info") {
    console.log(prefix, payload);
    return;
  }
  if (level === "warn") {
    console.warn(prefix, payload);
    return;
  }
  console.error(prefix, payload);
}

export function logFundsRejected(
  scope: "subscribe" | "estimate",
  reason: string,
  fields: Record<string, unknown>
): void {
  logFundsEvent(scope, "warn", "rejected", { reason, ...fields });
}

export function extractBodySummary(
  body: Record<string, unknown> | string
): Record<string, unknown> {
  if (typeof body === "string") {
    return { msg: body };
  }
  const summary: Record<string, unknown> = {};
  if (typeof body.msg === "string") summary.msg = body.msg;
  if (typeof body.code === "string") summary.code = body.code;
  if (typeof body.title === "string") summary.title = body.title;
  if (typeof body.rawMessage === "string") summary.rawMessage = body.rawMessage;
  if (body.errors && Array.isArray(body.errors)) {
    summary.validationErrors = body.errors;
  }
  return summary;
}
