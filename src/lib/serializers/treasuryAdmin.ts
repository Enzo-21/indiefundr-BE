import type { AppRevenueWithdrawal, TreasuryEvent } from "@prisma/client";
import type {
  TreasuryChainSummary,
  TreasuryChainTransaction,
  TreasuryOnChainBalances,
  TreasuryOnChainReport,
} from "@/services/admin/treasuryOnChain";

export function serializeTreasuryEvent(event: TreasuryEvent) {
  return {
    _id: event.id,
    type: event.type,
    amountUsdt: event.amountUsdt,
    investment: event.investmentId,
    purchaseOrder: event.purchaseOrderId,
    withdrawal: event.withdrawalId,
    poolAfter: event.poolAfter,
    surplusAfter: event.surplusAfter,
    protectedCreditedAfter: event.protectedCreditedAfter,
    protectedWithdrawnAfter: event.protectedWithdrawnAfter,
    meta: event.meta,
    createdAt: event.createdAt,
  };
}

export function serializeAppRevenueWithdrawal(withdrawal: AppRevenueWithdrawal) {
  return {
    _id: withdrawal.id,
    amountUsdt: withdrawal.amountUsdt,
    slotsConsumed: withdrawal.slotsConsumed,
    txRef: withdrawal.txRef,
    note: withdrawal.note,
    createdBy: withdrawal.createdBy,
    createdAt: withdrawal.createdAt,
  };
}

export function serializeTreasuryOnChainBalances(balances: TreasuryOnChainBalances) {
  return balances;
}

export function serializeTreasuryChainTransaction(tx: TreasuryChainTransaction) {
  return {
    ...tx,
    date: tx.date.toISOString(),
  };
}

export function serializeTreasuryChainSummary(summary: TreasuryChainSummary) {
  return summary;
}

export function serializeTreasuryOnChainReport(report: TreasuryOnChainReport) {
  return {
    balances: serializeTreasuryOnChainBalances(report.balances),
    transactions: report.transactions.map(serializeTreasuryChainTransaction),
    chainSummary: serializeTreasuryChainSummary(report.chainSummary),
    withdrawalSync: report.withdrawalSync,
    trxAlert: report.trxAlert,
    chainHistoryError: report.chainHistoryError,
  };
}

export type SerializedTreasuryOnChainReport = ReturnType<
  typeof serializeTreasuryOnChainReport
>;
