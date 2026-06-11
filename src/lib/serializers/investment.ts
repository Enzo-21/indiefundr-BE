import type { Investment } from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import { isChoiceDeadlineActive } from "@/lib/config/unpaidMaturityChoice";
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
  unpaidMaturityResolution: string | null;
  needsUnpaidMaturityChoice: boolean;
  canChooseReferralRecovery: boolean;
  canChooseTermExtension: boolean;
  extensionMinDays: number | null;
  extensionMaxDays: number | null;
  termExtensionDays: number | null;
  unpaidMaturityChoiceDeadlineAt: string | null;
  choiceDeadlineExpired: boolean;
  forfeitureReason: string | null;
  forfeitedAt: string | null;
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
  needsUnpaidMaturityChoice?: boolean;
  canChooseReferralRecovery?: boolean;
  canChooseTermExtension?: boolean;
  extensionMinDays?: number | null;
  extensionMaxDays?: number | null;
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
    statusLabel: getUserStatusLabel(investment, {
      needsUnpaidMaturityChoice: options.needsUnpaidMaturityChoice ?? false,
    }),
    canClaim: canUserClaim(investment),
    recoveryEligibleAt: investment.recoveryEligibleAt?.toISOString() ?? null,
    recoveryExpiresAt: investment.recoveryEligibleAt
      ? recoveryExpiresAt(investment.recoveryEligibleAt).toISOString()
      : null,
    recoveryQualifiedCount: options.recoveryQualifiedCount ?? null,
    recoveryRequiredCount: options.recoveryRequiredCount ?? null,
    unpaidMaturityResolution: investment.unpaidMaturityResolution ?? null,
    needsUnpaidMaturityChoice: options.needsUnpaidMaturityChoice ?? false,
    canChooseReferralRecovery: options.canChooseReferralRecovery ?? false,
    canChooseTermExtension: options.canChooseTermExtension ?? false,
    extensionMinDays: options.extensionMinDays ?? null,
    extensionMaxDays: options.extensionMaxDays ?? null,
    termExtensionDays: investment.termExtensionDays ?? null,
    unpaidMaturityChoiceDeadlineAt:
      investment.unpaidMaturityChoiceDeadlineAt?.toISOString() ?? null,
    choiceDeadlineExpired: investment.unpaidMaturityChoiceDeadlineAt
      ? !isChoiceDeadlineActive(investment.unpaidMaturityChoiceDeadlineAt)
      : false,
    forfeitureReason: investment.forfeitureReason ?? null,
    forfeitedAt: investment.forfeitedAt?.toISOString() ?? null,
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
