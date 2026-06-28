import type { AdminQueueRow } from "@/services/admin/purchaseOrderFulfillment";
import { listAdminSubscriptionQueue } from "@/services/admin/purchaseOrderFulfillment";
import type { AdminReferralPayoutRow } from "@/services/admin/referralPayoutOrderFulfillment";
import { listAdminReferralPayoutQueue } from "@/services/admin/referralPayoutOrderFulfillment";
import { listAdminWithdrawalQueue } from "@/services/admin/withdrawalOrderFulfillment";

export type AutopilotOrderCandidate = {
  orderType: "invest" | "withdraw" | "referral";
  orderId: string;
  userEmail: string;
  userName: string;
  fundName: string;
  kindLabel?: string;
  costUsdt: number;
  destinationLabel?: string;
  normalizedDateIso: string;
  topUpTxId: string | null;
  topUpTronscanUrl: string | null;
  usdtTxId: string | null;
  usdtTronscanUrl: string | null;
};

export type ListAutopilotOrderCandidatesOptions = {
  includeInvestment?: boolean;
  includeWithdrawal?: boolean;
  includeReferral?: boolean;
};

function truncateDestinationAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 20) {
    return trimmed;
  }
  return `${trimmed.slice(0, 10)}…${trimmed.slice(-8)}`;
}

export function buildAutopilotOrderCandidateFromRow(
  row: AdminQueueRow
): AutopilotOrderCandidate {
  const base = {
    orderId: row.orderId,
    userEmail: row.userEmail,
    userName: row.userName,
    costUsdt: row.costUsdt,
    normalizedDateIso: row.normalizedDateIso,
    topUpTxId: row.topUpTxId,
    topUpTronscanUrl: row.topUpTronscanUrl,
    usdtTxId: row.usdtTxId,
    usdtTronscanUrl: row.usdtTronscanUrl,
  };

  if (row.orderType === "withdraw") {
    return {
      ...base,
      orderType: "withdraw",
      fundName: "Withdrawal",
      destinationLabel: truncateDestinationAddress(row.destinationAddress),
    };
  }

  if (row.orderType === "referral") {
    return {
      ...base,
      orderType: "referral",
      fundName: row.kindLabel,
      kindLabel: row.kindLabel,
    };
  }

  return {
    ...base,
    orderType: "invest",
    fundName: row.fundName,
  };
}

export function buildAutopilotOrderCandidatesFromRows(
  rows: AdminQueueRow[]
): AutopilotOrderCandidate[] {
  return rows.map(buildAutopilotOrderCandidateFromRow);
}

export function buildAutopilotOrderCandidatesFromReferralRows(
  rows: AdminReferralPayoutRow[]
): AutopilotOrderCandidate[] {
  return rows.map(buildAutopilotOrderCandidateFromRow);
}

export function mergeAutopilotOrderCandidates(
  ...groups: AutopilotOrderCandidate[][]
): AutopilotOrderCandidate[] {
  const merged = groups.flat();
  merged.sort(
    (a, b) =>
      new Date(a.normalizedDateIso).getTime() -
      new Date(b.normalizedDateIso).getTime()
  );
  return merged;
}

export async function listAutopilotOrderCandidates(
  options: ListAutopilotOrderCandidatesOptions = {}
): Promise<AutopilotOrderCandidate[]> {
  const includeInvestment = options.includeInvestment !== false;
  const includeWithdrawal = options.includeWithdrawal !== false;
  const includeReferral = options.includeReferral !== false;

  const [subscriptions, withdrawals, referrals] = await Promise.all([
    includeInvestment ? listAdminSubscriptionQueue() : Promise.resolve([]),
    includeWithdrawal ? listAdminWithdrawalQueue() : Promise.resolve([]),
    includeReferral ? listAdminReferralPayoutQueue() : Promise.resolve([]),
  ]);

  return mergeAutopilotOrderCandidates(
    buildAutopilotOrderCandidatesFromRows(subscriptions),
    buildAutopilotOrderCandidatesFromRows(withdrawals),
    buildAutopilotOrderCandidatesFromReferralRows(referrals)
  );
}
