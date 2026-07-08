export type AdminActionError = {
  code: string;
  msg: string;
};

export function isTronRateLimit(error: AdminActionError) {
  return error.code === "TRON_RATE_LIMIT";
}

export function adminErrorTitle(error: AdminActionError, fallback: string) {
  return isTronRateLimit(error) ? "Tron provider rate limit" : fallback;
}

export function adminErrorDescription(error: AdminActionError) {
  if (isTronRateLimit(error)) {
    return `${error.msg} This dashboard reads wallet data synced from TronGrid. Wait a minute and refresh, or reduce concurrent admin scans.`;
  }
  return error.msg;
}
