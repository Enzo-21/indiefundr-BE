import type { Investment } from "@prisma/client";
import {
  REVENUE_ENGINE_ENABLED,
} from "@/lib/config/revenueEngine";
import { drawSurplus, getLedgerSnapshot, recordPayoutOutflow } from "./ledger";
import { canFundFromPool, getPoolMin } from "./pool";
import { calculateTriadPayoutAccounting } from "./accounting";
import { isSurplusPayoutTrigger } from "./payoutScheduler";

export async function onRedeemCompleted(investment: Investment): Promise<void> {
  if (!REVENUE_ENGINE_ENABLED()) {
    return;
  }

  const ledgerBefore = await getLedgerSnapshot();
  const poolBefore = ledgerBefore.poolAvailable;
  const pHead = investment.projectedPayoutUsdt;
  const surplusFunded = isSurplusPayoutTrigger(investment.payoutTriggeredBy);

  let fromSurplus = surplusFunded ? investment.projectedPayoutUsdt : 0;
  if (!surplusFunded) {
    const obligationsRest = 0;
    const poolMin = getPoolMin(poolBefore, investment, obligationsRest);
    const funding = canFundFromPool(
      poolBefore,
      poolMin,
      ledgerBefore.treasurySurplus
    );
    fromSurplus = funding.fromSurplus;
    if (funding.fromSurplus > 0) {
      await drawSurplus(funding.fromSurplus, investment, { reason: "mixed_funding" });
    }
  }

  const triadAccounting = await calculateTriadPayoutAccounting(investment);

  await recordPayoutOutflow(investment, {
    fromSurplus,
    trigger: investment.payoutTriggeredBy,
    reason: investment.payoutReason,
    surplusFunded,
    grossTriadInflow: triadAccounting.grossTriadInflow,
    protectedRevenueAmount: triadAccounting.protectedRevenueAmount,
    payoutAmount: triadAccounting.payoutAmount,
    triadSurplus: triadAccounting.triadSurplus,
    unlockingInvestmentIds: triadAccounting.unlockingInvestmentIds,
    unlockingUserIds: triadAccounting.unlockingUserIds,
    missingUnlockingInvestmentIds:
      triadAccounting.missingUnlockingInvestmentIds,
    completeTriad: triadAccounting.complete,
    warning: triadAccounting.warning,
  });

  // Surplus is credited per subscription (subscribe_triad_slice); do not credit again on payout.
}
