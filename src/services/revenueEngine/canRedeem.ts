import { InvestmentStatus } from "@prisma/client";
import { REVENUE_ENGINE_ENABLED } from "@/lib/config/revenueEngine";
import { prisma } from "@/lib/prisma";
import { evaluateAll } from "./evaluateAll";
import { getLedgerSnapshot } from "./ledger";
import { buildGlobalQueue, getQueueHead } from "./queue";
import { canFundFromPool, getPoolMin, sumObligationsRest } from "./pool";

export type CanRedeemResult =
  | { ok: true; fromSurplus?: number; reason?: string }
  | {
      ok: false;
      reason: string;
      status?: string;
      payoutEligibleAt?: Date | null;
      payabilityStatus?: string;
      newSubscribersNeeded?: number | null;
      poolAvailable?: number;
      poolMin?: number;
      treasurySurplus?: number;
    };

export async function canRedeem(investmentId: string): Promise<CanRedeemResult> {
  if (!REVENUE_ENGINE_ENABLED()) {
    return { ok: true, reason: "engine_disabled" };
  }

  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
  });
  if (!investment) {
    return { ok: false, reason: "not_found" };
  }

  if (investment.status !== InvestmentStatus.matured) {
    return { ok: false, reason: "not_matured", status: investment.status };
  }

  if (investment.payabilityStatus !== "payable") {
    await evaluateAll();
    const refreshed = await prisma.investment.findUnique({
      where: { id: investmentId },
    });
    if (!refreshed || refreshed.payabilityStatus !== "payable") {
      return {
        ok: false,
        reason: "pending_liquidity",
        payabilityStatus: refreshed?.payabilityStatus,
        newSubscribersNeeded: refreshed?.newSubscribersNeeded,
      };
    }
  }

  const matured = await prisma.investment.findMany({
    where: { status: InvestmentStatus.matured },
    orderBy: { subscribedAt: "asc" },
  });

  const queue = buildGlobalQueue(matured);
  const head = getQueueHead(queue);

  if (!head || head.id !== investment.id) {
    return { ok: false, reason: "not_queue_head" };
  }

  const ledger = await getLedgerSnapshot();
  const obligationsRest = sumObligationsRest(queue, head.id);
  const poolMin = getPoolMin(ledger.poolAvailable, head, obligationsRest);
  const funding = canFundFromPool(
    ledger.poolAvailable,
    poolMin,
    ledger.treasurySurplus
  );

  if (!funding.ok) {
    return {
      ok: false,
      reason: "insufficient_pool",
      poolAvailable: ledger.poolAvailable,
      poolMin,
      treasurySurplus: ledger.treasurySurplus,
    };
  }

  return { ok: true, fromSurplus: funding.fromSurplus };
}
