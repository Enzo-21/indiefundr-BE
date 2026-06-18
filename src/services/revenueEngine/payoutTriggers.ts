export type PayoutTrigger =
  | "admin"
  | "cron"
  | "admin_surplus"
  | "cron_surplus"
  | "admin_surplus_liquidity"
  | "cron_surplus_liquidity";

const SURPLUS_LIQUIDITY_TRIGGERS = new Set<PayoutTrigger>([
  "admin_surplus",
  "cron_surplus",
  "admin_surplus_liquidity",
  "cron_surplus_liquidity",
]);

export function isSurplusPayoutTrigger(
  trigger?: string | null
): trigger is Extract<
  PayoutTrigger,
  | "admin_surplus"
  | "cron_surplus"
  | "admin_surplus_liquidity"
  | "cron_surplus_liquidity"
> {
  return (
    trigger != null &&
    SURPLUS_LIQUIDITY_TRIGGERS.has(trigger as PayoutTrigger)
  );
}
