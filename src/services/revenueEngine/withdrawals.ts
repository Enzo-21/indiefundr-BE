import { TreasuryEventType } from "@prisma/client";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { GLOBAL_LEDGER_ID, prisma } from "@/lib/prisma";
import {
  computeWithdrawableFromLedgerFields,
  getOrCreateLedger,
} from "./ledger";

export type AppWithdrawalAuditSyncResult = {
  recorded: number;
  skipped: number;
  failed: Array<{ txId: string; error: string }>;
};

export type AuditWithdrawalCandidate = {
  txId: string;
  amountUsdt: number;
  detail: string | null;
};

async function loadRecordedWithdrawalTxIds(): Promise<Set<string>> {
  const rows = await prisma.appRevenueWithdrawal.findMany({
    where: { txRef: { not: null } },
    select: { txRef: true },
  });
  return new Set(
    rows
      .map((row) => row.txRef)
      .filter((txRef): txRef is string => Boolean(txRef))
  );
}

/** Audit rows eligible for automatic ledger sync (linked app withdrawal only). */
export const AUDIT_APP_WITHDRAWAL_SYNC_WHERE = {
  category: "treasury_app_withdrawal",
  classificationSource: "app_tx",
  status: "confirmed",
  direction: "out",
} as const;

async function loadAuditWithdrawalCandidates(): Promise<AuditWithdrawalCandidate[]> {
  return prisma.adminOnChainTransaction.findMany({
    where: AUDIT_APP_WITHDRAWAL_SYNC_WHERE,
    orderBy: { chainDate: "asc" },
    select: { txId: true, amountUsdt: true, detail: true },
  });
}

export async function recordAppWithdrawal({
  amountUsdt,
  txRef,
  note,
  createdBy = "admin",
}: {
  amountUsdt: number;
  txRef?: string;
  note?: string;
  createdBy?: string;
}) {
  const amount = ledgerTruncateUsdt(amountUsdt);
  if (amount <= 0) {
    throw new Error("Withdrawal amount must be positive");
  }

  const normalizedTxRef = txRef?.trim() || undefined;
  if (normalizedTxRef) {
    const existing = await prisma.appRevenueWithdrawal.findUnique({
      where: { txRef: normalizedTxRef },
    });
    if (existing) {
      return { withdrawal: existing, ledger: await getOrCreateLedger() };
    }
  }

  const ledger = await getOrCreateLedger();
  const { protectedRevenueAvailable: withdrawable } =
    computeWithdrawableFromLedgerFields(ledger);
  if (withdrawable < amount) {
    throw new Error(
      `Insufficient withdrawable liquidity: need ${amount} USDT, available ${withdrawable} (pool − surplus)`
    );
  }

  const withdrawal = await prisma.appRevenueWithdrawal.create({
    data: {
      amountUsdt: amount,
      slotsConsumed: 0,
      txRef: normalizedTxRef,
      note,
      createdBy,
    },
  });

  const updatedLedger = await prisma.treasuryLedger.update({
    where: { id: GLOBAL_LEDGER_ID },
    data: {
      poolAvailable: ledgerTruncateUsdt(
        Math.max(0, ledger.poolAvailable - amount)
      ),
      protectedRevenueWithdrawn: ledgerTruncateUsdt(
        ledger.protectedRevenueWithdrawn + amount
      ),
      version: ledger.version + 1,
      updatedAt: new Date(),
    },
  });

  await prisma.treasuryEvent.create({
    data: {
      type: TreasuryEventType.app_withdrawal,
      amountUsdt: amount,
      withdrawalId: withdrawal.id,
      poolAfter: updatedLedger.poolAvailable,
      surplusAfter: updatedLedger.treasurySurplus,
      protectedCreditedAfter: updatedLedger.protectedRevenueCredited,
      protectedWithdrawnAfter: updatedLedger.protectedRevenueWithdrawn,
      meta: { txRef: normalizedTxRef, note },
    },
  });

  return { withdrawal, ledger: updatedLedger };
}

/** Removes a recorded app withdrawal and restores ledger pool and withdrawn total. */
export async function reverseAppWithdrawal(withdrawalId: string) {
  const withdrawal = await prisma.appRevenueWithdrawal.findUnique({
    where: { id: withdrawalId },
  });
  if (!withdrawal) {
    throw new Error("App revenue withdrawal not found");
  }

  const ledger = await getOrCreateLedger();
  const event = await prisma.treasuryEvent.findFirst({
    where: {
      type: TreasuryEventType.app_withdrawal,
      withdrawalId: withdrawal.id,
    },
  });

  const amount = ledgerTruncateUsdt(withdrawal.amountUsdt);

  const updatedLedger = await prisma.$transaction(async (tx) => {
    const nextLedger = await tx.treasuryLedger.update({
      where: { id: GLOBAL_LEDGER_ID },
      data: {
        poolAvailable: ledgerTruncateUsdt(ledger.poolAvailable + amount),
        protectedRevenueWithdrawn: ledgerTruncateUsdt(
          Math.max(0, ledger.protectedRevenueWithdrawn - amount)
        ),
        version: ledger.version + 1,
        updatedAt: new Date(),
      },
    });

    if (event) {
      await tx.treasuryEvent.delete({ where: { id: event.id } });
    }
    await tx.appRevenueWithdrawal.delete({ where: { id: withdrawal.id } });

    return nextLedger;
  });

  return { withdrawal, ledger: updatedLedger, reversedEventId: event?.id ?? null };
}

export async function syncUnrecordedAppWithdrawalsFromAudit(
  recordFn: typeof recordAppWithdrawal = recordAppWithdrawal,
  options?: {
    loadRecordedTxIds?: () => Promise<Set<string>>;
    loadCandidates?: () => Promise<AuditWithdrawalCandidate[]>;
  }
): Promise<AppWithdrawalAuditSyncResult> {
  const [recordedTxIds, candidates] = await Promise.all([
    options?.loadRecordedTxIds?.() ?? loadRecordedWithdrawalTxIds(),
    options?.loadCandidates?.() ?? loadAuditWithdrawalCandidates(),
  ]);

  const result: AppWithdrawalAuditSyncResult = {
    recorded: 0,
    skipped: 0,
    failed: [],
  };

  for (const row of candidates) {
    if (recordedTxIds.has(row.txId)) {
      result.skipped += 1;
      continue;
    }

    try {
      await recordFn({
        amountUsdt: row.amountUsdt,
        txRef: row.txId,
        note: row.detail ?? "Synced from admin on-chain audit",
        createdBy: "system",
      });
      recordedTxIds.add(row.txId);
      result.recorded += 1;
    } catch (error) {
      result.failed.push({
        txId: row.txId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
