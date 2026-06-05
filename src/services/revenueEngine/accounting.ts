import type { Investment } from "@prisma/client";
import {
  APP_NET_REVENUE_PER_SUBSCRIBER_USDT,
  INVESTMENT_AMOUNT_USDT,
} from "@/lib/config/revenueEngine";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { prisma } from "@/lib/prisma";

/** Triad surplus for a completed payout: 3×principal − 3×protected − payout. */
export function triadSurplusForPayout(payoutAmountUsdt: number): number {
  const principal = INVESTMENT_AMOUNT_USDT();
  const protectedPerTriad = 3 * APP_NET_REVENUE_PER_SUBSCRIBER_USDT();
  const grossTriadInflow = 3 * principal;
  return ledgerTruncateUsdt(
    Math.max(0, grossTriadInflow - protectedPerTriad - payoutAmountUsdt)
  );
}

/** Surplus slice credited on each subscription (triad surplus ÷ 3, 2dp per spec CSV). */
export function surplusPerSubscription(projectedPayoutUsdt: number): number {
  return ledgerTruncateUsdt(triadSurplusForPayout(projectedPayoutUsdt) / 3);
}

export type TriadAccountingInvestment = Pick<
  Investment,
  | "id"
  | "userId"
  | "amountUsdt"
  | "projectedPayoutUsdt"
  | "payoutUnlockingInvestmentIds"
  | "payoutUnlockingUserIds"
>;

export type TriadPayoutAccounting = {
  grossTriadInflow: number;
  protectedRevenueAmount: number;
  payoutAmount: number;
  triadSurplus: number;
  unlockingInvestmentIds: string[];
  unlockingUserIds: string[];
  missingUnlockingInvestmentIds: string[];
  complete: boolean;
  warning?: string;
};

export function calculateTriadPayoutAccountingFromInvestments(
  paidInvestment: TriadAccountingInvestment,
  unlockingInvestments: Pick<Investment, "id" | "userId" | "amountUsdt">[]
): TriadPayoutAccounting {
  const expectedIds = paidInvestment.payoutUnlockingInvestmentIds;
  const byId = new Map(unlockingInvestments.map((inv) => [inv.id, inv]));
  const orderedUnlockers = expectedIds
    .map((id) => byId.get(id))
    .filter((inv): inv is Pick<Investment, "id" | "userId" | "amountUsdt"> =>
      Boolean(inv)
    );
  const missingUnlockingInvestmentIds = expectedIds.filter((id) => !byId.has(id));
  const complete =
    expectedIds.length >= 2 &&
    orderedUnlockers.length >= 2 &&
    missingUnlockingInvestmentIds.length === 0;
  const payoutAmount = ledgerTruncateUsdt(
    paidInvestment.projectedPayoutUsdt || 0
  );
  const grossTriadInflow = ledgerTruncateUsdt(
    paidInvestment.amountUsdt +
      orderedUnlockers.reduce((sum, inv) => sum + (inv.amountUsdt || 0), 0)
  );

  if (!complete) {
    return {
      grossTriadInflow,
      protectedRevenueAmount: 0,
      payoutAmount,
      triadSurplus: 0,
      unlockingInvestmentIds: orderedUnlockers.map((inv) => inv.id),
      unlockingUserIds: orderedUnlockers.map((inv) => inv.userId),
      missingUnlockingInvestmentIds,
      complete: false,
      warning:
        "Payout triad is incomplete; surplus was not credited for this payout.",
    };
  }

  const protectedRevenueAmount = ledgerTruncateUsdt(
    (1 + orderedUnlockers.length) * APP_NET_REVENUE_PER_SUBSCRIBER_USDT()
  );
  const triadSurplus = ledgerTruncateUsdt(
    Math.max(0, grossTriadInflow - protectedRevenueAmount - payoutAmount)
  );

  return {
    grossTriadInflow,
    protectedRevenueAmount,
    payoutAmount,
    triadSurplus,
    unlockingInvestmentIds: orderedUnlockers.map((inv) => inv.id),
    unlockingUserIds: orderedUnlockers.map((inv) => inv.userId),
    missingUnlockingInvestmentIds,
    complete: true,
  };
}

export async function calculateTriadPayoutAccounting(
  paidInvestment: TriadAccountingInvestment
): Promise<TriadPayoutAccounting> {
  const ids = paidInvestment.payoutUnlockingInvestmentIds;
  const unlockingInvestments = ids.length
    ? await prisma.investment.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true, amountUsdt: true },
      })
    : [];

  return calculateTriadPayoutAccountingFromInvestments(
    paidInvestment,
    unlockingInvestments
  );
}
