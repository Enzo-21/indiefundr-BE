import { getEnv } from "@/lib/env";
import { getRecoveryInviteesRequired } from "@/lib/config/referralRecovery";

function cfg() {
  const e = getEnv();
  return {
    REFERRAL_BOOST_WINDOW_DAYS: e.referralBoostWindowDays,
  };
}

export const REFERRAL_BOOST_WINDOW_DAYS = () => cfg().REFERRAL_BOOST_WINDOW_DAYS;

/** Same invitee math as Recovery: 2 per 25 USDT principal. */
export const getBoostInviteesRequired = getRecoveryInviteesRequired;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function boostExpiresAt(boostActivatedAt: Date): Date {
  return new Date(
    boostActivatedAt.getTime() + REFERRAL_BOOST_WINDOW_DAYS() * MS_PER_DAY
  );
}

export function isBoostWindowActive(
  boostActivatedAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!boostActivatedAt) return false;
  return now.getTime() < boostExpiresAt(boostActivatedAt).getTime();
}

/**
 * Boost shortens maturesAt to the invite window. Require at least that many
 * days remaining so activation never extends the original term.
 */
export function canActivateBoostGivenMaturesAt(
  maturesAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!maturesAt) return false;
  const minRemainingMs = REFERRAL_BOOST_WINDOW_DAYS() * MS_PER_DAY;
  return maturesAt.getTime() - now.getTime() >= minRemainingMs;
}
