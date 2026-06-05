import type { AdminOnChainTransaction, TreasuryEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminOnChainCategoryLabel } from "@/services/admin/historySync";
import {
  treatmentFromAuditRow,
  type ExternalInflowTreatment,
} from "@/services/revenueEngine/externalTreasuryInflows";

export type AdminHistorySource = "ledger" | "treasury_chain" | "wallet_chain";

export type AdminHistoryPayoutUnlocker = {
  userId: string;
  name: string | null;
  email: string | null;
};

export type AdminHistoryRow = {
  id: string;
  source: AdminHistorySource;
  date: string;
  type: string;
  label: string;
  status: "recorded" | "confirmed" | "failed" | "pending";
  amountUsdt: number;
  direction: "in" | "out" | "transfer" | "ledger";
  userEmail: string | null;
  fromUserEmail: string | null;
  toUserEmail: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  detail: string | null;
  txId: string | null;
  tronscanUrl: string | null;
  poolAfter: number | null;
  surplusAfter: number | null;
  protectedCreditedAfter: number | null;
  protectedWithdrawnAfter: number | null;
  payoutUnlockers: AdminHistoryPayoutUnlocker[];
  inflowTreatment: ExternalInflowTreatment;
  inflowActionsEligible: boolean;
};

export type AdminHistorySnapshot = {
  rows: AdminHistoryRow[];
  generatedAt: string;
  chainHistoryError: boolean;
  ledgerEventCount: number;
  chainTransactionCount: number;
  auditTransactionCount: number;
};

type TreasuryEventHistoryInput = Pick<
  TreasuryEvent,
  | "id"
  | "type"
  | "amountUsdt"
  | "investmentId"
  | "purchaseOrderId"
  | "withdrawalId"
  | "poolAfter"
  | "surplusAfter"
  | "protectedCreditedAfter"
  | "protectedWithdrawnAfter"
  | "meta"
  | "createdAt"
>;

type UnlockerUserMap = Map<
  string,
  {
    name: string | null;
    email: string | null;
  }
>;

type AdminOnChainTransactionHistoryInput = Pick<
  AdminOnChainTransaction,
  | "id"
  | "txId"
  | "amountUsdt"
  | "status"
  | "direction"
  | "category"
  | "fromAddress"
  | "toAddress"
  | "fromUserEmail"
  | "toUserEmail"
  | "detail"
  | "tronscanUrl"
  | "chainDate"
  | "poolInflowRecordedAt"
  | "adminSurplusMarkedAt"
>;

export function isExternalTreasuryInflowEligible(
  tx: Pick<
    AdminOnChainTransactionHistoryInput,
    "category" | "direction" | "status"
  >
): boolean {
  return (
    tx.category === "treasury_external_deposit" &&
    tx.direction === "in" &&
    tx.status === "confirmed"
  );
}

function ledgerLabel(type: TreasuryEvent["type"]): string {
  switch (type) {
    case "subscribe_inflow":
      return "Subscription inflow";
    case "payout_outflow":
      return "User payout";
    case "surplus_credit":
      return "Surplus credit";
    case "surplus_draw":
      return "Surplus draw";
    case "app_withdrawal":
      return "App withdrawal";
    case "ledger_adjustment":
      return "Ledger adjustment";
    case "external_deposit_inflow":
      return "External deposit inflow";
    default:
      return type;
  }
}

function ledgerDirection(type: TreasuryEvent["type"]): AdminHistoryRow["direction"] {
  switch (type) {
    case "subscribe_inflow":
    case "surplus_credit":
    case "external_deposit_inflow":
      return "in";
    case "payout_outflow":
    case "surplus_draw":
    case "app_withdrawal":
      return "out";
    default:
      return "ledger";
  }
}

function metaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function metaStringArray(meta: unknown, key: string): string[] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const value = (meta as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function payoutUnlockingUserIds(event: TreasuryEventHistoryInput): string[] {
  if (event.type !== "payout_outflow") return [];
  return metaStringArray(event.meta, "unlockingUserIds");
}

function buildPayoutUnlockers(
  event: TreasuryEventHistoryInput,
  unlockerUsers: UnlockerUserMap
): AdminHistoryPayoutUnlocker[] {
  return payoutUnlockingUserIds(event).map((userId) => {
    const user = unlockerUsers.get(userId);
    return {
      userId,
      name: user?.name ?? null,
      email: user?.email ?? null,
    };
  });
}

function eventDetail(event: TreasuryEventHistoryInput): string | null {
  return (
    metaString(event.meta, "reason") ??
    metaString(event.meta, "note") ??
    metaString(event.meta, "fundId") ??
    event.investmentId ??
    event.purchaseOrderId ??
    event.withdrawalId
  );
}

export function treasuryEventToHistoryRow(
  event: TreasuryEventHistoryInput,
  unlockerUsers: UnlockerUserMap = new Map()
): AdminHistoryRow {
  return {
    id: `ledger-${event.id}`,
    source: "ledger",
    date: event.createdAt.toISOString(),
    type: event.type,
    label: ledgerLabel(event.type),
    status: "recorded",
    amountUsdt: event.amountUsdt,
    direction: ledgerDirection(event.type),
    userEmail: null,
    fromUserEmail: null,
    toUserEmail: null,
    fromAddress: null,
    toAddress: null,
    detail: eventDetail(event),
    txId: null,
    tronscanUrl: null,
    poolAfter: event.poolAfter,
    surplusAfter: event.surplusAfter,
    protectedCreditedAfter: event.protectedCreditedAfter,
    protectedWithdrawnAfter: event.protectedWithdrawnAfter,
    payoutUnlockers: buildPayoutUnlockers(event, unlockerUsers),
    inflowTreatment: "none",
    inflowActionsEligible: false,
  };
}

function auditSource(
  tx: Pick<AdminOnChainTransactionHistoryInput, "category">
): Exclude<AdminHistorySource, "ledger"> {
  return tx.category.startsWith("treasury_") ||
    tx.category === "investment_payment" ||
    tx.category === "user_payout"
    ? "treasury_chain"
    : "wallet_chain";
}

function auditUserEmail(tx: AdminOnChainTransactionHistoryInput): string | null {
  if (tx.fromUserEmail && tx.toUserEmail && tx.fromUserEmail !== tx.toUserEmail) {
    return `${tx.fromUserEmail} -> ${tx.toUserEmail}`;
  }
  return tx.toUserEmail ?? tx.fromUserEmail ?? null;
}

export function adminOnChainTransactionToHistoryRow(
  tx: AdminOnChainTransactionHistoryInput
): AdminHistoryRow {
  const inflowActionsEligible = isExternalTreasuryInflowEligible(tx);
  return {
    id: `chain-${tx.id}`,
    source: auditSource(tx),
    date: tx.chainDate.toISOString(),
    type: tx.category,
    label: adminOnChainCategoryLabel(tx.category),
    status: tx.status as AdminHistoryRow["status"],
    amountUsdt: tx.amountUsdt,
    direction: tx.direction as AdminHistoryRow["direction"],
    userEmail: auditUserEmail(tx),
    fromUserEmail: tx.fromUserEmail,
    toUserEmail: tx.toUserEmail,
    fromAddress: tx.fromAddress,
    toAddress: tx.toAddress,
    detail: tx.detail,
    txId: tx.txId,
    tronscanUrl: tx.tronscanUrl,
    poolAfter: null,
    surplusAfter: null,
    protectedCreditedAfter: null,
    protectedWithdrawnAfter: null,
    payoutUnlockers: [],
    inflowTreatment: treatmentFromAuditRow(tx),
    inflowActionsEligible,
  };
}

export function buildAdminHistoryRows({
  events,
  auditTransactions,
  limit,
  unlockerUsers = new Map(),
}: {
  events: TreasuryEventHistoryInput[];
  auditTransactions: AdminOnChainTransactionHistoryInput[];
  limit: number;
  unlockerUsers?: UnlockerUserMap;
}): AdminHistoryRow[] {
  return [
    ...events.map((event) => treasuryEventToHistoryRow(event, unlockerUsers)),
    ...auditTransactions.map(adminOnChainTransactionToHistoryRow),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

export async function getAdminHistory({
  limit = 100,
}: { limit?: number } = {}): Promise<AdminHistorySnapshot> {
  const clamped = Math.min(200, Math.max(1, limit));

  const [events, auditTransactions] = await Promise.all([
    prisma.treasuryEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: clamped,
    }),
    prisma.adminOnChainTransaction.findMany({
      orderBy: { chainDate: "desc" },
      take: clamped,
    }),
  ]);

  const unlockingUserIds = Array.from(
    new Set(events.flatMap(payoutUnlockingUserIds))
  );
  const unlockerUsers = await prisma.user.findMany({
    where: { id: { in: unlockingUserIds } },
    select: { id: true, name: true, email: true },
  });
  const unlockerMap: UnlockerUserMap = new Map(
    unlockerUsers.map((user) => [
      user.id,
      { name: user.name ?? null, email: user.email ?? null },
    ])
  );

  return {
    rows: buildAdminHistoryRows({
      events,
      auditTransactions,
      limit: clamped,
      unlockerUsers: unlockerMap,
    }),
    generatedAt: new Date().toISOString(),
    chainHistoryError: false,
    ledgerEventCount: events.length,
    chainTransactionCount: auditTransactions.length,
    auditTransactionCount: auditTransactions.length,
  };
}
