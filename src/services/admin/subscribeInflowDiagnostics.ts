import { InvestmentStatus, PurchaseOrderStatus, TreasuryEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  expectedLedgerAfterSubscriptionEvents,
  ledgerProtectedWithdrawable,
  loadAggressiveAlphaSimulationCsv,
} from "@/services/revenueEngine/simulateLedgerFromCsv";

const SUBSCRIBED_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.active,
  InvestmentStatus.matured,
  InvestmentStatus.redeeming,
  InvestmentStatus.redeemed,
];

export type SubscribeInflowDiagnostics = {
  completedInvestmentCount: number;
  subscribeInflowEventCount: number;
  missingSubscribeInflowCount: number;
  aggressiveAlphaCompletedCount: number;
  csvExpectedAtAggressiveCount: {
    poolAvailable: number;
    treasurySurplus: number;
    protectedWithdrawable: number;
  } | null;
};

export async function buildSubscribeInflowDiagnostics(): Promise<SubscribeInflowDiagnostics> {
  const [completedInvestmentCount, subscribeInflowEventCount, aggressiveAlphaCompletedCount] =
    await Promise.all([
      prisma.investment.count({
        where: {
          subscribedAt: { not: null },
          status: { in: SUBSCRIBED_STATUSES },
          purchaseOrder: {
            status: PurchaseOrderStatus.completed,
            usdtTxId: { not: null },
          },
        },
      }),
      prisma.treasuryEvent.count({
        where: { type: TreasuryEventType.subscribe_inflow },
      }),
      prisma.investment.count({
        where: {
          fundId: "aggressive-alpha",
          subscribedAt: { not: null },
          status: { in: SUBSCRIBED_STATUSES },
          purchaseOrder: {
            status: PurchaseOrderStatus.completed,
            usdtTxId: { not: null },
          },
        },
      }),
    ]);

  const missingSubscribeInflowCount = Math.max(
    0,
    completedInvestmentCount - subscribeInflowEventCount
  );

  const csvRows = loadAggressiveAlphaSimulationCsv();
  const csvState =
    aggressiveAlphaCompletedCount > 0
      ? expectedLedgerAfterSubscriptionEvents(
          csvRows,
          aggressiveAlphaCompletedCount
        )
      : null;

  return {
    completedInvestmentCount,
    subscribeInflowEventCount,
    missingSubscribeInflowCount,
    aggressiveAlphaCompletedCount,
    csvExpectedAtAggressiveCount: csvState
      ? {
          poolAvailable: csvState.poolAvailable,
          treasurySurplus: csvState.treasurySurplus,
          protectedWithdrawable: ledgerProtectedWithdrawable(
            csvState.poolAvailable,
            csvState.treasurySurplus
          ),
        }
      : null,
  };
}
