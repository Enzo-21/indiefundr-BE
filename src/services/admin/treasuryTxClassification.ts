import type {
  AdminOnChainCategory,
  AdminOnChainClassificationSource,
} from "@/services/admin/historySync";
import {
  classifyAdminOnChainTransfer,
  loadAdminHistorySyncContext,
  upsertClassifiedAdminOnChainTransfer,
} from "@/services/admin/historySync";
import {
  auditCategoryToTreasuryChain,
  auditOverrideToDisplayCategory,
  isAdminWithdrawalCategoryOverride,
  type AdminWithdrawalCategoryOverride,
} from "@/services/admin/treasuryClassification";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  recordAppWithdrawal,
  reverseAppWithdrawal,
} from "@/services/revenueEngine/withdrawals";
import * as tron from "@/services/tron/client";

export type ClassifyTreasuryWithdrawalIntent =
  | "link_withdrawal"
  | "unlink_withdrawal";

async function assertNotUserPayout(txId: string): Promise<void> {
  const investments = await prisma.investment.findMany({
    where: { redemptionTransaction: { not: null } },
    select: { redemptionTransaction: true },
  });
  for (const inv of investments) {
    const raw = inv.redemptionTransaction;
    if (!raw || typeof raw !== "object") continue;
    const redemptionTxId = tron.getTxId(raw as Record<string, unknown>);
    if (redemptionTxId === txId) {
      throw new Error(
        "This transaction is a user payout redemption and cannot be reclassified as a treasury withdrawal"
      );
    }
  }
}

async function ensureAuditRowForTreasuryTx(
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
  if (row.type !== "out") {
    throw new Error("Only outbound treasury transfers can be classified as withdrawals");
  }
  if (Math.abs(row.amount - amountUsdt) > 0.0001 && amountUsdt > 0) {
    // amount from caller; row.amount is authoritative on chain
  }

  const ctx = await loadAdminHistorySyncContext();
  const classified = classifyAdminOnChainTransfer(
    { ...row, status: "confirmed" },
    ctx
  );
  if (!classified) {
    throw new Error("Could not classify treasury transaction for audit storage");
  }
  await upsertClassifiedAdminOnChainTransfer(classified);
}

async function persistAdminCategoryOverride(
  txId: string,
  override: AdminWithdrawalCategoryOverride,
  adminEmail: string,
  note?: string
): Promise<void> {
  const mapped = auditCategoryToTreasuryChain(override);
  const now = new Date();

  await prisma.adminOnChainTransaction.updateMany({
    where: { txId },
    data: {
      adminCategoryOverride: override,
      adminOverrideBy: adminEmail,
      adminOverrideNote: note?.trim() || null,
      adminOverriddenAt: now,
      category: override,
      classificationSource: mapped.source,
    },
  });
}

async function resolveOutboundAmountUsdt(
  txId: string,
  amountUsdt?: number
): Promise<number> {
  if (amountUsdt != null && amountUsdt > 0) {
    return amountUsdt;
  }

  const audit = await prisma.adminOnChainTransaction.findFirst({
    where: { txId, direction: "out" },
    select: { amountUsdt: true },
  });
  if (audit?.amountUsdt) {
    return audit.amountUsdt;
  }

  throw new Error(
    "Could not resolve withdrawal amount; sync treasury history or pass amountUsdt"
  );
}

export async function linkTreasuryOutflowAsAppWithdrawal({
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

  await assertNotUserPayout(normalizedTxId);

  const amount = await resolveOutboundAmountUsdt(normalizedTxId, amountUsdt);

  await ensureAuditRowForTreasuryTx(normalizedTxId, amount);

  await persistAdminCategoryOverride(
    normalizedTxId,
    "treasury_app_withdrawal",
    adminEmail,
    note
  );

  const result = await recordAppWithdrawal({
    amountUsdt: amount,
    txRef: normalizedTxId,
    note: note?.trim() || "Linked from treasury on-chain transaction",
    createdBy: adminEmail,
  });

  return {
    intent: "link_withdrawal" as const,
    txId: normalizedTxId,
    withdrawal: result.withdrawal,
    ledger: result.ledger,
  };
}

export async function unlinkAppWithdrawalFromLedger({
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

  await assertNotUserPayout(normalizedTxId);

  const existing = await prisma.appRevenueWithdrawal.findUnique({
    where: { txRef: normalizedTxId },
  });

  let reversed: Awaited<ReturnType<typeof reverseAppWithdrawal>> | null = null;
  if (existing) {
    reversed = await reverseAppWithdrawal(existing.id);
  }

  const amount =
    existing?.amountUsdt ??
    (await resolveOutboundAmountUsdt(normalizedTxId).catch(() => 0));
  if (amount > 0) {
    await ensureAuditRowForTreasuryTx(normalizedTxId, amount).catch(() => {
      /* audit row optional when unlinking with no chain history */
    });
  }

  await persistAdminCategoryOverride(
    normalizedTxId,
    "treasury_outflow_untracked",
    adminEmail,
    note
  );

  return {
    intent: "unlink_withdrawal" as const,
    txId: normalizedTxId,
    reversedWithdrawalId: reversed?.withdrawal.id ?? null,
    ledger: reversed?.ledger ?? null,
  };
}

export async function loadCategoryOverridesByTxId(): Promise<
  Map<string, AdminWithdrawalCategoryOverride>
> {
  const rows = await prisma.adminOnChainTransaction.findMany({
    where: {
      adminCategoryOverride: { not: null },
      txId: { not: "" },
    },
    select: { txId: true, adminCategoryOverride: true },
  });

  const map = new Map<string, AdminWithdrawalCategoryOverride>();
  for (const row of rows) {
    if (isAdminWithdrawalCategoryOverride(row.adminCategoryOverride)) {
      map.set(row.txId, row.adminCategoryOverride);
    }
  }
  return map;
}

export function applyWithdrawalCategoryOverride<
  T extends { category: string; source: string },
>(
  txId: string,
  classified: T,
  overrides: Map<string, AdminWithdrawalCategoryOverride>
): T {
  const override = overrides.get(txId);
  if (!override) return classified;

  const mapped = auditCategoryToTreasuryChain(override);
  return {
    ...classified,
    category: mapped.category,
    source: mapped.source,
  };
}

export function applyAuditWithdrawalCategoryOverride(
  txId: string,
  classified: {
    category: string;
    classificationSource: string;
    detail: string | null;
  },
  overrides: Map<string, AdminWithdrawalCategoryOverride>
): {
  category: AdminOnChainCategory;
  classificationSource: AdminOnChainClassificationSource;
  detail: string | null;
} {
  const override = overrides.get(txId);
  if (!override) {
    return {
      category: classified.category as AdminOnChainCategory,
      classificationSource:
        classified.classificationSource as AdminOnChainClassificationSource,
      detail: classified.detail,
    };
  }

  const mapped = auditCategoryToTreasuryChain(override);
  return {
    category: auditOverrideToDisplayCategory(override),
    classificationSource: mapped.source,
    detail:
      override === "treasury_app_withdrawal"
        ? classified.detail ?? "Treasury withdrawal (admin override)"
        : "Treasury outflow (admin override — not on ledger)",
  };
}
