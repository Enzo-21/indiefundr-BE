/** Fixed USDT purchase via Mercado Pago (Argentina). Quote API later. */

export const USDT_PURCHASE_AMOUNT = 25;
export const USDT_PURCHASE_ARS_PER_USDT = 1500;
/** Markup baked into displayed price (not shown as its own line). */
export const USDT_PURCHASE_HIDDEN_MARKUP_PCT = 6;
/** Mercado Pago processing fee shown to the user. */
export const USDT_PURCHASE_MP_FEE_PCT = 6;

export type UsdtPurchasePricing = {
  amountUsdt: number;
  arsPerUsdt: number;
  baseArs: number;
  hiddenMarkupPct: number;
  mpFeePct: number;
  priceWithMarkupArs: number;
  mpFeeArs: number;
  totalArs: number;
};

function roundArs(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildUsdtPurchasePricing(
  overrides?: Partial<{
    amountUsdt: number;
    arsPerUsdt: number;
    hiddenMarkupPct: number;
    mpFeePct: number;
  }>
): UsdtPurchasePricing {
  const amountUsdt = overrides?.amountUsdt ?? USDT_PURCHASE_AMOUNT;
  const arsPerUsdt = overrides?.arsPerUsdt ?? USDT_PURCHASE_ARS_PER_USDT;
  const hiddenMarkupPct =
    overrides?.hiddenMarkupPct ?? USDT_PURCHASE_HIDDEN_MARKUP_PCT;
  const mpFeePct = overrides?.mpFeePct ?? USDT_PURCHASE_MP_FEE_PCT;

  const baseArs = roundArs(amountUsdt * arsPerUsdt);
  const priceWithMarkupArs = roundArs(baseArs * (1 + hiddenMarkupPct / 100));
  const mpFeeArs = roundArs(priceWithMarkupArs * (mpFeePct / 100));
  const totalArs = roundArs(priceWithMarkupArs + mpFeeArs);

  return {
    amountUsdt,
    arsPerUsdt,
    baseArs,
    hiddenMarkupPct,
    mpFeePct,
    priceWithMarkupArs,
    mpFeeArs,
    totalArs,
  };
}
