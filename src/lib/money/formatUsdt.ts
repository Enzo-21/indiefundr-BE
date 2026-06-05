const FLOAT_EPSILON = 1e-9;

/**
 * Truncate toward zero at `fractionDigits` (never round up).
 * Small positive epsilon corrects binary float noise (e.g. 29.989999999998 → 29.99).
 */
export function truncateUsdt(
  value: number,
  fractionDigits = 2
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** fractionDigits;
  const bias = value < 0 ? -FLOAT_EPSILON : FLOAT_EPSILON;
  return Math.trunc(value * factor + bias) / factor;
}

/**
 * Format USDT for admin display without rounding up.
 */
export function formatUsdtDisplay(
  value: number,
  fractionDigits = 2
): string {
  const truncated = truncateUsdt(value, fractionDigits);
  const sign = truncated < 0 ? "-" : "";
  const abs = Math.abs(truncated);
  const factor = 10 ** fractionDigits;
  const units = Math.trunc(abs * factor + FLOAT_EPSILON);
  const whole = Math.trunc(units / factor);
  const frac = units % factor;
  const fracStr = String(frac).padStart(fractionDigits, "0");
  return `${sign}${whole}.${fracStr}`;
}

/** Ledger bookkeeping uses 2 decimal places (simulation CSV semantics). */
export const LEDGER_USDT_DECIMALS = 2;

export function ledgerTruncateUsdt(value: number): number {
  return truncateUsdt(value, LEDGER_USDT_DECIMALS);
}

export function ledgerProtectedWithdrawable(
  pool: number,
  surplus: number
): number {
  return ledgerTruncateUsdt(Math.max(0, pool - surplus));
}

export function formatUsdtDisplayOrDash(
  value: number | null | undefined,
  fractionDigits = 2
): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return formatUsdtDisplay(value, fractionDigits);
}
