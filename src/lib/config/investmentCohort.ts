import {
  APP_NET_REVENUE_PER_SUBSCRIBER_USDT,
  INVESTMENT_AMOUNT_USDT,
} from "@/lib/config/revenueEngine";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";

/** Platform revenue ratio at the configured reference investment amount. */
export function platformRevenueRatio(): number {
  const reference = INVESTMENT_AMOUNT_USDT();
  if (reference <= 0) return 0;
  return APP_NET_REVENUE_PER_SUBSCRIBER_USDT() / reference;
}

/** Protected platform share for one investment at the given principal. */
export function protectedRevenueForAmount(amountUsdt: number): number {
  return ledgerTruncateUsdt(amountUsdt * platformRevenueRatio());
}

/** Principal from later investors required to unlock a payout head. */
export function unlockPrincipalRequired(headAmountUsdt: number): number {
  return ledgerTruncateUsdt(2 * headAmountUsdt);
}

/** How many "cohort slots" one unlocker contributes relative to the head amount. */
export function unlockSlotEquivalent(
  unlockerAmountUsdt: number,
  headAmountUsdt: number
): number {
  if (headAmountUsdt <= 0) return 0;
  return ledgerTruncateUsdt(unlockerAmountUsdt / headAmountUsdt);
}

/**
 * Triad surplus for a homogeneous cohort at `principalPerLegUsdt`.
 * gross = 3×principal; protected = 3×protectedRevenueForAmount(principal).
 */
export function triadSurplusForPayout(
  payoutAmountUsdt: number,
  principalPerLegUsdt: number
): number {
  const grossTriadInflow = ledgerTruncateUsdt(3 * principalPerLegUsdt);
  const protectedPerTriad = ledgerTruncateUsdt(
    3 * protectedRevenueForAmount(principalPerLegUsdt)
  );
  return ledgerTruncateUsdt(
    Math.max(0, grossTriadInflow - protectedPerTriad - payoutAmountUsdt)
  );
}

/** Surplus slice credited on each subscription (symmetric triad at this investment's amount). */
export function surplusPerSubscription(
  projectedPayoutUsdt: number,
  amountUsdt: number
): number {
  return ledgerTruncateUsdt(
    triadSurplusForPayout(projectedPayoutUsdt, amountUsdt) / 3
  );
}

/** Sum protected revenue across head + unlockers with per-investment amounts. */
export function protectedRevenueForTriadLegs(
  legs: ReadonlyArray<{ amountUsdt: number }>
): number {
  return ledgerTruncateUsdt(
    legs.reduce((sum, leg) => sum + protectedRevenueForAmount(leg.amountUsdt), 0)
  );
}
