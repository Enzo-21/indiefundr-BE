/** Fixed pack size + markups for Mercado Pago USDT purchase (Argentina). Rate from live quote. */

export const USDT_PURCHASE_AMOUNT = 50;
/** Markup baked into displayed price (not shown as its own line). */
export const USDT_PURCHASE_HIDDEN_MARKUP_PCT = 6;
/** Mercado Pago processing fee shown to the user. */
export const USDT_PURCHASE_MP_FEE_PCT = 6;
/**
 * Staging / Shasta: charge 35% of production ARS so MP test payments stay cheap.
 * USDT credited remains USDT_PURCHASE_AMOUNT.
 */
export const USDT_PURCHASE_STAGING_ARS_SCALE = 0.35;

export type UsdtPurchasePricing = {
  amountUsdt: number;
  arsPerUsdt: number;
  baseArs: number;
  hiddenMarkupPct: number;
  mpFeePct: number;
  priceWithMarkupArs: number;
  mpFeeArs: number;
  totalArs: number;
  /** 1 in production; 0.35 on staging/testnet. */
  arsChargeScale: number;
};

function roundArs(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Full ARS charges only on mainnet/production DB; otherwise 35% for cheaper MP tests. */
export function getUsdtPurchaseArsChargeScale(
  env: NodeJS.ProcessEnv = process.env
): number {
  const network = env.BLOCKCHAIN_NETWORK?.trim().toLowerCase();
  const dbUrl = env.DATABASE_URL ?? "";
  if (network === "mainnet" || /\/production(\?|$)/.test(dbUrl)) {
    return 1;
  }
  return USDT_PURCHASE_STAGING_ARS_SCALE;
}

export function buildUsdtPurchasePricing(input: {
  arsPerUsdt: number;
  amountUsdt?: number;
  hiddenMarkupPct?: number;
  mpFeePct?: number;
  /** Override env detection (tests). */
  arsChargeScale?: number;
}): UsdtPurchasePricing {
  const marketArsPerUsdt = input.arsPerUsdt;
  if (!Number.isFinite(marketArsPerUsdt) || marketArsPerUsdt <= 0) {
    throw new Error("arsPerUsdt must be a positive finite number");
  }

  const amountUsdt = input.amountUsdt ?? USDT_PURCHASE_AMOUNT;
  const hiddenMarkupPct =
    input.hiddenMarkupPct ?? USDT_PURCHASE_HIDDEN_MARKUP_PCT;
  const mpFeePct = input.mpFeePct ?? USDT_PURCHASE_MP_FEE_PCT;
  const arsChargeScale =
    input.arsChargeScale ?? getUsdtPurchaseArsChargeScale();

  // Scale the market rate so stored ARS fields stay consistent with amountUsdt.
  const arsPerUsdt = roundArs(marketArsPerUsdt * arsChargeScale);
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
    arsChargeScale,
  };
}
