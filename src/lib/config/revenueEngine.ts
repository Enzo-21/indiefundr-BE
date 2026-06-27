import { getEnv } from "@/lib/env";
import { COHORT_REFERENCE_INVESTMENT_USDT } from "@/lib/config/investmentCohort";

/** Legacy liquidity slice for surplusPerSubscriber test helper only. */
const LEGACY_PAYOUT_LIQUIDITY_RESERVE_PER_SUBSCRIBER_USDT = 10 / 3;

function cfg() {
  const e = getEnv();
  const appNet = e.appNetRevenuePerSubscriberUsdt;
  return {
    MIN_APP_MARGIN_USDT: e.minAppMarginUsdt,
    APP_NET_REVENUE_PER_SUBSCRIBER_USDT: appNet,
    REVENUE_ENGINE_ENABLED: e.revenueEngineEnabled,
  };
}

function legacyMinPlatformMarginPerSubscriberUsdt(): number {
  return (
    cfg().APP_NET_REVENUE_PER_SUBSCRIBER_USDT +
    LEGACY_PAYOUT_LIQUIDITY_RESERVE_PER_SUBSCRIBER_USDT
  );
}

export const MIN_APP_MARGIN_USDT = () => cfg().MIN_APP_MARGIN_USDT;
/** Platform share credited per completed investment (env: APP_NET_REVENUE_PER_SUBSCRIBER_USDT). */
export const APP_NET_REVENUE_PER_SUBSCRIBER_USDT = () =>
  cfg().APP_NET_REVENUE_PER_SUBSCRIBER_USDT;

/** Alias: same value as APP_NET_REVENUE_PER_SUBSCRIBER_USDT, per investment not per user. */
export const APP_NET_REVENUE_PER_INVESTMENT_USDT = APP_NET_REVENUE_PER_SUBSCRIBER_USDT;
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
  mFloor: number = MIN_APP_MARGIN_USDT(),
  currentSubscriptionAmount: number = COHORT_REFERENCE_INVESTMENT_USDT
) => {
  const needed = additionalInflowNeeded(poolAvailable, pHead, mFloor);
  const unit =
    currentSubscriptionAmount > 0
      ? currentSubscriptionAmount
      : COHORT_REFERENCE_INVESTMENT_USDT;
  return Math.ceil(needed / unit);
};

/** @deprecated Legacy diagnostic helper — surplus math uses investmentCohort.ts in production. */
export const surplusPerSubscriber = (poolAfter: number, n = 3) => {
  const marginPerSubscriber = poolAfter / n;
  return Math.max(
    0,
    marginPerSubscriber - legacyMinPlatformMarginPerSubscriberUsdt()
  );
};
