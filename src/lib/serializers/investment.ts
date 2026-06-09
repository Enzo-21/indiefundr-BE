import type { Investment } from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import { recoveryExpiresAt } from "@/lib/config/referralRecovery";
import {
  canUserClaim,
  getUserStatusLabel,
} from "@/lib/investments/presentation";

export type EnrichedInvestmentJson = {
  _id: string;
  userId: string;
  walletId: string;
  fundId: string;
  amountUsdt: number;
  returnPercent90d: number;
  projectedPayoutUsdt: number;
  status: string;
  purchaseOrderId: string | null;
  transaction: unknown;
  redemptionTransaction: unknown;
  subscribedAt: string | null;
  maturesAt: string | null;
  redeemedAt: string | null;
  payabilityStatus: string;
  payoutEligibleAt: string | null;
  markedPayableAt: string | null;
  globalQueueRank: number | null;
  newSubscribersNeeded: number | null;
  date: string;
  fundName: string;
  statusLabel: string;
  canClaim: boolean;
  recoveryEligibleAt: string | null;
  recoveryExpiresAt: string | null;
  recoveryQualifiedCount: number | null;
  recoveryRequiredCount: number | null;
  fund: {
    id: string;
    name: string;
    returnPercent90d: number;
    riskLabel: string;
    accentColor: string;
  } | null;
};

export type EnrichInvestmentOptions = {
  recoveryQualifiedCount?: number | null;
  recoveryRequiredCount?: number | null;
};

export function enrichInvestment(
  investment: Investment,
  options: EnrichInvestmentOptions = {}
): EnrichedInvestmentJson {
  const fund = getFundById(investment.fundId);
  return {
    _id: investment.id,
    userId: investment.userId,
    walletId: investment.walletId,
    fundId: investment.fundId,
    amountUsdt: investment.amountUsdt,
    returnPercent90d: investment.returnPercent90d,
    projectedPayoutUsdt: investment.projectedPayoutUsdt,
    status: investment.status,
    purchaseOrderId: investment.purchaseOrderId,
    transaction: investment.transaction,
    redemptionTransaction: investment.redemptionTransaction,
    subscribedAt: investment.subscribedAt?.toISOString() ?? null,
    maturesAt: investment.maturesAt?.toISOString() ?? null,
    redeemedAt: investment.redeemedAt?.toISOString() ?? null,
    payabilityStatus: investment.payabilityStatus,
    payoutEligibleAt: investment.payoutEligibleAt?.toISOString() ?? null,
    markedPayableAt: investment.markedPayableAt?.toISOString() ?? null,
    globalQueueRank: investment.globalQueueRank,
    newSubscribersNeeded: investment.newSubscribersNeeded,
    date: investment.date.toISOString(),
    fundName: fund?.name || investment.fundId,
    statusLabel: getUserStatusLabel(investment),
    canClaim: canUserClaim(investment),
    recoveryEligibleAt: investment.recoveryEligibleAt?.toISOString() ?? null,
    recoveryExpiresAt: investment.recoveryEligibleAt
      ? recoveryExpiresAt(investment.recoveryEligibleAt).toISOString()
      : null,
    recoveryQualifiedCount: options.recoveryQualifiedCount ?? null,
    recoveryRequiredCount: options.recoveryRequiredCount ?? null,
    fund: fund
      ? {
          id: fund.id,
          name: fund.name,
          returnPercent90d: fund.returnPercent90d,
          riskLabel: fund.riskLabel,
          accentColor: fund.accentColor,
        }
      : null,
  };
}
