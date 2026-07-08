import { BASE_INVESTMENT_AMOUNT_USDT } from "@/lib/config/pricing";
import { getEnv } from "@/lib/env";

function cfg() {
  const e = getEnv();
  return {
    REFERRAL_INVITEE_BONUS_USDT: e.referralInviteeBonusUsdt,
    REFERRAL_INVITER_BONUS_USDT: e.referralInviterBonusUsdt,
    REFERRAL_RECOVERY_WINDOW_DAYS: e.referralRecoveryWindowDays,
    SYMPATHY_MODAL_COOLDOWN_DAYS: e.sympathyModalCooldownDays,
  };
}

export const REFERRAL_INVITEE_BONUS_USDT = () => cfg().REFERRAL_INVITEE_BONUS_USDT;
export const REFERRAL_INVITER_BONUS_USDT = () => cfg().REFERRAL_INVITER_BONUS_USDT;
export const REFERRAL_RECOVERY_WINDOW_DAYS = () => cfg().REFERRAL_RECOVERY_WINDOW_DAYS;
export const SYMPATHY_MODAL_COOLDOWN_DAYS = () => cfg().SYMPATHY_MODAL_COOLDOWN_DAYS;

/**
 * Invitees required to recover principal: 2 per base tier unit (25 USDT).
 * 25 → 2, 50 → 4, 75 → 6, 100 → 8.
 */
export function getRecoveryInviteesRequired(principalUsdt: number): number {
  const units = Math.max(
    1,
    Math.round(principalUsdt / BASE_INVESTMENT_AMOUNT_USDT)
  );
  return units * 2;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function recoveryExpiresAt(recoveryEligibleAt: Date): Date {
  return new Date(
    recoveryEligibleAt.getTime() + REFERRAL_RECOVERY_WINDOW_DAYS() * MS_PER_DAY
  );
}

export function isRecoveryWindowActive(
  recoveryEligibleAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!recoveryEligibleAt) return false;
  return now.getTime() < recoveryExpiresAt(recoveryEligibleAt).getTime();
}
