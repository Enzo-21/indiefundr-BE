import { InvestmentStatus, type Investment } from "@prisma/client";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import { getFundById } from "@/lib/config/investmentFunds";
import { getEnv } from "@/lib/env";

export const UNPAID_MATURITY_EXTENSION_MIN_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

export function UNPAID_MATURITY_CHOICE_HOURS(): number {
  return getEnv().unpaidMaturityChoiceHours;
}

export function choiceDeadlineAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + UNPAID_MATURITY_CHOICE_HOURS() * MS_PER_HOUR);
}

export function isChoiceDeadlineActive(
  deadlineAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!deadlineAt) return false;
  return now.getTime() < deadlineAt.getTime();
}

export type UnpaidMaturityChoiceWindowFields = Pick<
  Investment,
  "status" | "unpaidMaturityResolution" | "unpaidMaturityChoiceDeadlineAt"
>;

/** Matured investment inside the 48h unpaid-maturity choice window (no resolution yet). */
export function hasActiveUnpaidMaturityChoiceWindow(
  investment: UnpaidMaturityChoiceWindowFields,
  now: Date = new Date()
): boolean {
  return (
    investment.status === InvestmentStatus.matured &&
    investment.unpaidMaturityResolution == null &&
    investment.unpaidMaturityChoiceDeadlineAt != null &&
    isChoiceDeadlineActive(investment.unpaidMaturityChoiceDeadlineAt, now)
  );
}

export function maxExtensionDays(termDays: number): number {
  return Math.floor(termDays / 2);
}

export function extensionBounds(termDays: number): {
  minDays: number;
  maxDays: number;
  termDays: number;
} {
  const maxDays = Math.max(
    UNPAID_MATURITY_EXTENSION_MIN_DAYS,
    maxExtensionDays(termDays)
  );
  return {
    minDays: UNPAID_MATURITY_EXTENSION_MIN_DAYS,
    maxDays,
    termDays,
  };
}

export function clampExtensionDays(
  termDays: number,
  requestedDays: number
): number | null {
  if (!Number.isInteger(requestedDays)) return null;
  const { minDays, maxDays } = extensionBounds(termDays);
  if (requestedDays < minDays || requestedDays > maxDays) return null;
  return requestedDays;
}

export function computeInvestmentTermDays(
  investment: Pick<Investment, "fundId" | "subscribedAt" | "maturesAt">,
  fund?: InvestmentFund | null
): number {
  const catalogFund = fund ?? getFundById(investment.fundId);
  if (catalogFund?.termDays && catalogFund.termDays > 0) {
    return catalogFund.termDays;
  }

  if (investment.subscribedAt && investment.maturesAt) {
    const diffMs =
      investment.maturesAt.getTime() - investment.subscribedAt.getTime();
    const days = Math.round(diffMs / MS_PER_DAY);
    if (days > 0) return days;
  }

  return 90;
}
