import { prisma } from "@/lib/prisma";
import {
  serializeAppRevenueWithdrawal,
  serializeTreasuryEvent,
} from "@/lib/serializers/treasuryAdmin";
import {
  getAdminLedgerSnapshot,
  getAdminQueue as getRevenueAdminQueue,
  recordAppWithdrawal,
} from "@/services/revenueEngine";
import { getTreasuryOnChainReport } from "@/services/admin/treasuryOnChain";

export async function getAdminLedger() {
  return getAdminLedgerSnapshot();
}

export async function getAdminQueue() {
  return getRevenueAdminQueue();
}

export async function getAdminEvents(limit = 50) {
  const clamped = Math.min(200, Math.max(1, limit));
  const events = await prisma.treasuryEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: clamped,
  });
  return events.map(serializeTreasuryEvent);
}

export async function createAdminWithdrawal({
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
  const result = await recordAppWithdrawal({
    amountUsdt,
    txRef,
    note,
    createdBy,
  });
  const ledger = await getAdminLedgerSnapshot();
  return {
    withdrawal: serializeAppRevenueWithdrawal(result.withdrawal),
    ledger,
  };
}

export function isInsufficientWithdrawalError(message: string): boolean {
  return message.includes("Insufficient");
}

export async function getAdminOnChainReport() {
  const report = await getTreasuryOnChainReport();
  return report;
}

export async function listAdminAppRevenueWithdrawals() {
  const rows = await prisma.appRevenueWithdrawal.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeAppRevenueWithdrawal);
}
