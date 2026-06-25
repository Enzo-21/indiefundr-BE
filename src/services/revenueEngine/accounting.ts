import type { Investment } from "@prisma/client";
import {
  protectedRevenueForTriadLegs,
  surplusPerSubscription,
  triadSurplusForPayout,
} from "@/lib/config/investmentCohort";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { prisma } from "@/lib/prisma";

export { surplusPerSubscription, triadSurplusForPayout };

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
  const payoutAmount = ledgerTruncateUsdt(
    paidInvestment.projectedPayoutUsdt || 0
  );
  const grossTriadInflow = ledgerTruncateUsdt(
    paidInvestment.amountUsdt +
      orderedUnlockers.reduce((sum, inv) => sum + (inv.amountUsdt || 0), 0)
  );

  const hasUnlockers = orderedUnlockers.length > 0;
  const complete =
    hasUnlockers && missingUnlockingInvestmentIds.length === 0;

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

  const triadLegs = [
    { amountUsdt: paidInvestment.amountUsdt },
    ...orderedUnlockers.map((inv) => ({ amountUsdt: inv.amountUsdt })),
  ];
  const protectedRevenueAmount = protectedRevenueForTriadLegs(triadLegs);
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
