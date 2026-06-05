import { InvestmentStatus } from "@prisma/client";
import { isPastPayoutEligible } from "@/lib/investments/presentation";
import { prisma } from "@/lib/prisma";
import { canRedeem } from "./canRedeem";
import { evaluateAll, getLastEvaluation } from "./evaluateAll";
import { getAdminLedgerSnapshot, getLedgerSnapshot } from "./ledger";
import { onInvestmentMatured } from "./onInvestmentMatured";
import { onRedeemCompleted } from "./onRedeemCompleted";
import { onSubscribeCompleted } from "./onSubscribeCompleted";
import {
  computeFifoSurplusEligibleInvestmentIds,
  evaluatePayoutReadiness,
  executeInvestmentPayout,
  executeSurplusInvestmentPayout,
  getSurplusPayoutEligibility,
  getSurplusPayoutEligibilityWithFifo,
  pickNextFifoSurplusPayoutInvestmentId,
  processDueAutomaticPayouts,
  processSurplusLiquidityPayouts,
} from "./payoutScheduler";
export {
  surplusPerSubscription,
  triadSurplusForPayout,
} from "./accounting";
import {
  recordAppWithdrawal,
  reverseAppWithdrawal,
  syncUnrecordedAppWithdrawalsFromAudit,
} from "./withdrawals";

export { canRedeem };
export { evaluateAll, getLastEvaluation as lastEvaluation };
export { getAdminLedgerSnapshot, getLedgerSnapshot };
export { onSubscribeCompleted };
export { onInvestmentMatured };
export { onRedeemCompleted };
export {
  evaluatePayoutReadiness,
  executeInvestmentPayout,
  executeSurplusInvestmentPayout,
  getSurplusPayoutEligibility,
  getSurplusPayoutEligibilityWithFifo,
  computeFifoSurplusEligibleInvestmentIds,
  pickNextFifoSurplusPayoutInvestmentId,
  processDueAutomaticPayouts,
  processSurplusLiquidityPayouts,
};
export {
  recordAppWithdrawal,
  reverseAppWithdrawal,
  syncUnrecordedAppWithdrawalsFromAudit,
};
export {
  markExternalTreasuryInflowAsWithdrawable,
  markExternalTreasuryInflowAsSurplus,
  markExternalTreasuryInflowAsWithdrawableFromSurplus,
  clearExternalTreasuryInflowClassification,
  loadInflowTreatmentByTxId,
  treatmentFromAuditRow,
  type ExternalInflowTreatment,
} from "./externalTreasuryInflows";
export { isPastPayoutEligible };

export async function getAdminQueue() {
  const ready = await prisma.investment.findMany({
    where: {
      status: {
        in: [
          InvestmentStatus.active,
          InvestmentStatus.matured,
          InvestmentStatus.redeeming,
          InvestmentStatus.redeemed,
        ],
      },
      payoutUnlockedAt: { not: null },
    },
    orderBy: { subscribedAt: "asc" },
    include: { user: { select: { email: true, name: true } } },
  });
  const ledger = await getLedgerSnapshot();
  const lastEval = getLastEvaluation();

  return {
    ledger,
    queue: ready.map((inv, index) => ({
      rank: index + 1,
      investmentId: inv.id,
      userId: inv.userId,
      userEmail: inv.user.email,
      userName: inv.user.name,
      fundId: inv.fundId,
      subscribedAt: inv.subscribedAt,
      projectedPayoutUsdt: inv.projectedPayoutUsdt,
      status: inv.status,
      payabilityStatus: inv.payabilityStatus,
      payoutUnlockedAt: inv.payoutUnlockedAt,
      payoutEligibleAt: inv.payoutEligibleAt,
      payoutReason: inv.payoutReason,
      payoutTriggeredBy: inv.payoutTriggeredBy,
      payoutFailureReason: inv.payoutFailureReason,
      newSubscribersNeeded: inv.newSubscribersNeeded,
    })),
    lastEvaluation: lastEval,
  };
}
