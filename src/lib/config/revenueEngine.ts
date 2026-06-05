import { getEnv } from "@/lib/env";

function cfg() {
  const e = getEnv();
  return {
    INVESTMENT_AMOUNT_USDT: e.investmentAmountUsdt,
    MIN_APP_MARGIN_USDT: e.minAppMarginUsdt,
    APP_NET_REVENUE_PER_SUBSCRIBER_USDT: e.appNetRevenuePerSubscriberUsdt,
    PAYOUT_LIQUIDITY_RESERVE_PER_SUBSCRIBER_USDT:
      e.payoutLiquidityReservePerSubscriberUsdt,
    MIN_PLATFORM_MARGIN_PER_SUBSCRIBER_USDT:
      e.appNetRevenuePerSubscriberUsdt +
      e.payoutLiquidityReservePerSubscriberUsdt,
    MIN_PLATFORM_MARGIN_PER_TRIAD_USDT: e.minPlatformMarginPerTriadUsdt,
    REVENUE_ENGINE_ENABLED: e.revenueEngineEnabled,
  };
}

export const INVESTMENT_AMOUNT_USDT = () => cfg().INVESTMENT_AMOUNT_USDT;
export const MIN_APP_MARGIN_USDT = () => cfg().MIN_APP_MARGIN_USDT;
/** Platform share credited per completed investment (env: APP_NET_REVENUE_PER_SUBSCRIBER_USDT). */
export const APP_NET_REVENUE_PER_SUBSCRIBER_USDT = () =>
  cfg().APP_NET_REVENUE_PER_SUBSCRIBER_USDT;

/** Alias: same value as APP_NET_REVENUE_PER_SUBSCRIBER_USDT, per investment not per user. */
export const APP_NET_REVENUE_PER_INVESTMENT_USDT = APP_NET_REVENUE_PER_SUBSCRIBER_USDT;
export const PAYOUT_LIQUIDITY_RESERVE_PER_SUBSCRIBER_USDT = () =>
  cfg().PAYOUT_LIQUIDITY_RESERVE_PER_SUBSCRIBER_USDT;
export const MIN_PLATFORM_MARGIN_PER_SUBSCRIBER_USDT = () =>
  cfg().MIN_PLATFORM_MARGIN_PER_SUBSCRIBER_USDT;
export const MIN_PLATFORM_MARGIN_PER_TRIAD_USDT = () =>
  cfg().MIN_PLATFORM_MARGIN_PER_TRIAD_USDT;
export const REVENUE_ENGINE_ENABLED = () => cfg().REVENUE_ENGINE_ENABLED;

export const roundUsdt = (n: number) => Math.round(Number(n) * 1e6) / 1e6;

export const additionalInflowNeeded = (
  poolAvailable: number,
  pHead: number,
  mFloor: number = MIN_APP_MARGIN_USDT()
) => Math.max(0, pHead + mFloor - poolAvailable);

export const newSubscribersNeeded = (
  poolAvailable: number,
  pHead: number,
  mFloor: number = MIN_APP_MARGIN_USDT()
) => {
  const needed = additionalInflowNeeded(poolAvailable, pHead, mFloor);
  return Math.ceil(needed / INVESTMENT_AMOUNT_USDT());
};

export const surplusPerSubscriber = (poolAfter: number, n = 3) => {
  const marginPerSubscriber = poolAfter / n;
  return Math.max(
    0,
    marginPerSubscriber - MIN_PLATFORM_MARGIN_PER_SUBSCRIBER_USDT()
  );
};

export const surplusLiquidityTriad = (poolAfter: number, n = 3) =>
  roundUsdt(n * surplusPerSubscriber(poolAfter, n));

export const slotsConsumedForWithdrawal = (amountUsdt: number) =>
  Math.ceil(amountUsdt / APP_NET_REVENUE_PER_SUBSCRIBER_USDT());
