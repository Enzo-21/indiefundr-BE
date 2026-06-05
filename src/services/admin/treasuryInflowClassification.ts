import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import {
  classifyAdminOnChainTransfer,
  loadAdminHistorySyncContext,
  upsertClassifiedAdminOnChainTransfer,
} from "@/services/admin/historySync";
import {
  clearExternalTreasuryInflowClassification,
  markExternalTreasuryInflowAsSurplus,
  markExternalTreasuryInflowAsWithdrawable,
  markExternalTreasuryInflowAsWithdrawableFromSurplus,
} from "@/services/revenueEngine/externalTreasuryInflows";
import * as tron from "@/services/tron/client";

export type ClassifyTreasuryInflowIntent =
  | "mark_inflow_withdrawable"
  | "mark_inflow_surplus"
  | "clear_inflow_classification";

async function ensureAuditRowForTreasuryInflow(
  txId: string,
  amountUsdt: number
): Promise<void> {
  const existing = await prisma.adminOnChainTransaction.findFirst({
    where: { txId },
    select: { id: true },
  });
  if (existing) return;

  const env = getEnv();
  const rawAddress = env.treasuryAddress.trim();
  if (!rawAddress) {
    throw new Error("Treasury address not configured");
  }
  const rows = await tron.getTrc20UsdtTransfers(rawAddress, {
    limit: env.treasuryActivityLimit,
  });
  const enriched = await tron.enrichTrc20TransferStatuses(rows, {
    concurrency: env.walletActivityStatusConcurrency,
    fallbackStatusOnLookupError: "confirmed",
  });
  const row = enriched.find((r) => r.txId === txId);
  if (!row) {
    throw new Error("Treasury transaction not found in recent on-chain activity");
  }
  if (row.type !== "in") {
    throw new Error("Only inbound treasury transfers can be classified");
  }

  const ctx = await loadAdminHistorySyncContext();
  const classified = classifyAdminOnChainTransfer(
    { ...row, status: "confirmed" },
    ctx
  );
  if (!classified) {
    throw new Error("Could not classify treasury transaction for audit storage");
  }
  if (classified.category !== "treasury_external_deposit") {
    throw new Error(
      "Only external treasury deposits can be marked as withdrawable or surplus"
    );
  }
  await upsertClassifiedAdminOnChainTransfer(classified);
}

async function resolveInboundAmountUsdt(
  txId: string,
  amountUsdt?: number
): Promise<number> {
  if (amountUsdt != null && amountUsdt > 0) {
    return amountUsdt;
  }

  const audit = await prisma.adminOnChainTransaction.findFirst({
    where: { txId, direction: "in" },
    select: { amountUsdt: true },
  });
  if (audit?.amountUsdt) {
    return audit.amountUsdt;
  }

  throw new Error(
    "Could not resolve inflow amount; sync treasury history or pass amountUsdt"
  );
}

export async function linkTreasuryInflowAsWithdrawable({
  txId,
  amountUsdt,
  note,
  adminEmail,
}: {
  txId: string;
  amountUsdt?: number;
  note?: string;
  adminEmail: string;
}) {
  const normalizedTxId = txId.trim();
  if (!normalizedTxId) {
    throw new Error("txId is required");
  }

  const amount = await resolveInboundAmountUsdt(normalizedTxId, amountUsdt);
  await ensureAuditRowForTreasuryInflow(normalizedTxId, amount);

  const result = await markExternalTreasuryInflowAsWithdrawable({
    txId: normalizedTxId,
    adminEmail,
    note: note?.trim() || "Marked as withdrawable liquidity",
  });

  return {
    intent: "mark_inflow_withdrawable" as const,
    txId: normalizedTxId,
    ledger: result.ledger,
    alreadyMarked: result.alreadyMarked,
  };
}

export async function linkTreasuryInflowAsSurplus({
  txId,
  amountUsdt,
  note,
  adminEmail,
}: {
  txId: string;
  amountUsdt?: number;
  note?: string;
  adminEmail: string;
}) {
  const normalizedTxId = txId.trim();
  if (!normalizedTxId) {
    throw new Error("txId is required");
  }

  const amount = await resolveInboundAmountUsdt(normalizedTxId, amountUsdt);
  await ensureAuditRowForTreasuryInflow(normalizedTxId, amount);

  const result = await markExternalTreasuryInflowAsSurplus({
    txId: normalizedTxId,
    adminEmail,
    note: note?.trim() || "Marked as surplus",
  });

  return {
    intent: "mark_inflow_surplus" as const,
    txId: normalizedTxId,
    ledger: result.ledger,
    alreadyMarked: result.alreadyMarked,
  };
}

export async function clearTreasuryInflowClassification({
  txId,
  adminEmail,
  note,
}: {
  txId: string;
  adminEmail: string;
  note?: string;
}) {
  const normalizedTxId = txId.trim();
  if (!normalizedTxId) {
    throw new Error("txId is required");
  }

  const amount = await resolveInboundAmountUsdt(normalizedTxId).catch(() => 0);
  if (amount > 0) {
    await ensureAuditRowForTreasuryInflow(normalizedTxId, amount).catch(() => {
      /* audit row optional when clearing with no chain history */
    });
  }

  const result = await clearExternalTreasuryInflowClassification({
    txId: normalizedTxId,
    adminEmail,
    note: note?.trim() || "Cleared external deposit classification",
  });

  return {
    intent: "clear_inflow_classification" as const,
    txId: normalizedTxId,
    ledger: result.ledger,
    alreadyCleared: result.alreadyCleared,
  };
}

export async function switchTreasuryInflowToWithdrawable({
  txId,
  adminEmail,
  note,
}: {
  txId: string;
  adminEmail: string;
  note?: string;
}) {
  const normalizedTxId = txId.trim();
  if (!normalizedTxId) {
    throw new Error("txId is required");
  }

  const amount = await resolveInboundAmountUsdt(normalizedTxId).catch(() => 0);
  if (amount > 0) {
    await ensureAuditRowForTreasuryInflow(normalizedTxId, amount).catch(() => {});
  }

  const result = await markExternalTreasuryInflowAsWithdrawableFromSurplus({
    txId: normalizedTxId,
    adminEmail,
    note: note?.trim() || "Moved to withdrawable liquidity",
  });

  return {
    intent: "mark_inflow_withdrawable" as const,
    txId: normalizedTxId,
    ledger: result.ledger,
    switchedFromSurplus: true as const,
  };
}

export {
  loadInflowTreatmentByTxId,
  treatmentFromAuditRow,
  type ExternalInflowTreatment,
  type ExternalInflowState,
} from "@/services/revenueEngine/externalTreasuryInflows";
