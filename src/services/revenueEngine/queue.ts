import type { Investment } from "@prisma/client";
import { riskRank } from "./riskRank";

export const MATURED_UNPAID_STATUSES = ["matured"] as const;

export function isMaturedUnpaid(inv: Investment): boolean {
  return MATURED_UNPAID_STATUSES.includes(
    inv.status as (typeof MATURED_UNPAID_STATUSES)[number]
  );
}

export function getPayableInvestmentForUser(
  userInvestments: Investment[]
): Investment | null {
  const matured = userInvestments.filter(isMaturedUnpaid);
  if (matured.length === 0) return null;

  matured.sort((a, b) => {
    const rankDiff = riskRank(a.fundId) - riskRank(b.fundId);
    if (rankDiff !== 0) return rankDiff;
    const aSub = a.subscribedAt ? a.subscribedAt.getTime() : 0;
    const bSub = b.subscribedAt ? b.subscribedAt.getTime() : 0;
    return aSub - bSub;
  });

  return matured[0];
}

export function buildGlobalQueue(allMaturedUnpaid: Investment[]): Investment[] {
  const byUser = new Map<string, Investment[]>();

  for (const inv of allMaturedUnpaid) {
    const uid = inv.userId;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(inv);
  }

  const payableSlots: Investment[] = [];
  for (const userInvs of byUser.values()) {
    const slot = getPayableInvestmentForUser(userInvs);
    if (slot) payableSlots.push(slot);
  }

  payableSlots.sort((a, b) => {
    const aSub = a.subscribedAt ? a.subscribedAt.getTime() : 0;
    const bSub = b.subscribedAt ? b.subscribedAt.getTime() : 0;
    return aSub - bSub;
  });

  return payableSlots;
}

export function getQueueHead(queue: Investment[]): Investment | null {
  return queue.length > 0 ? queue[0] : null;
}
