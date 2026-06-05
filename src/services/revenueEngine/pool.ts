import type { Investment } from "@prisma/client";
import {
  MIN_APP_MARGIN_USDT,
  roundUsdt,
} from "@/lib/config/revenueEngine";

export function computeMv1(
  poolAvailable: number,
  pHead: number,
  obligationsRest: number
): number {
  const poolAfter = poolAvailable - pHead;
  const obligationGap = Math.max(0, obligationsRest - poolAfter);
  return roundUsdt(Math.max(MIN_APP_MARGIN_USDT(), obligationGap));
}

export function getPoolMin(
  poolAvailable: number,
  head: Investment,
  obligationsRest = 0
): number {
  const pHead = head.projectedPayoutUsdt;
  return roundUsdt(pHead + computeMv1(poolAvailable, pHead, obligationsRest));
}

export function liquidityShortfall(
  poolAvailable: number,
  poolMin: number
): number {
  return roundUsdt(Math.max(0, poolMin - poolAvailable));
}

export function canFundFromPool(
  poolAvailable: number,
  poolMin: number,
  treasurySurplus = 0
): { ok: boolean; fromSurplus: number; shortfall?: number } {
  if (poolAvailable >= poolMin) return { ok: true, fromSurplus: 0 };
  const shortfall = liquidityShortfall(poolAvailable, poolMin);
  if (treasurySurplus >= shortfall) {
    return { ok: true, fromSurplus: shortfall };
  }
  return { ok: false, fromSurplus: 0, shortfall };
}

export function sumObligationsRest(
  queueEntries: Investment[],
  headId: string
): number {
  let sum = 0;
  let pastHead = false;
  for (const entry of queueEntries) {
    if (entry.id === headId) {
      pastHead = true;
      continue;
    }
    if (pastHead) {
      sum += entry.projectedPayoutUsdt || 0;
    }
  }
  return roundUsdt(sum);
}
