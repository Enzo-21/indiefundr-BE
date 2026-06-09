import { getEnv } from "@/lib/env";

function cfg() {
  const e = getEnv();
  return {
    REFERRAL_INVITEE_BONUS_USDT: e.referralInviteeBonusUsdt,
    REFERRAL_INVITER_BONUS_USDT: e.referralInviterBonusUsdt,
    REFERRAL_RECOVERY_PRINCIPAL_USDT: e.referralRecoveryPrincipalUsdt,
    REFERRAL_RECOVERY_INVITEES_REQUIRED: e.referralRecoveryInviteesRequired,
    REFERRAL_MONTHLY_SURPLUS_CAP_USDT: e.referralMonthlySurplusCapUsdt,
    REFERRAL_RECOVERY_WINDOW_DAYS: e.referralRecoveryWindowDays,
    SYMPATHY_MODAL_COOLDOWN_DAYS: e.sympathyModalCooldownDays,
  };
}

export const REFERRAL_INVITEE_BONUS_USDT = () => cfg().REFERRAL_INVITEE_BONUS_USDT;
export const REFERRAL_INVITER_BONUS_USDT = () => cfg().REFERRAL_INVITER_BONUS_USDT;
export const REFERRAL_RECOVERY_PRINCIPAL_USDT = () =>
  cfg().REFERRAL_RECOVERY_PRINCIPAL_USDT;
export const REFERRAL_RECOVERY_INVITEES_REQUIRED = () =>
  cfg().REFERRAL_RECOVERY_INVITEES_REQUIRED;
export const REFERRAL_MONTHLY_SURPLUS_CAP_USDT = () =>
  cfg().REFERRAL_MONTHLY_SURPLUS_CAP_USDT;
export const REFERRAL_RECOVERY_WINDOW_DAYS = () => cfg().REFERRAL_RECOVERY_WINDOW_DAYS;
export const SYMPATHY_MODAL_COOLDOWN_DAYS = () => cfg().SYMPATHY_MODAL_COOLDOWN_DAYS;

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
