import {
  reconcileTreasuryLedgerFromExpected,
  type LedgerReconciliationResult,
} from "@/services/revenueEngine/ledgerReconcile";

export type AdminTreasuryReconcileResult = LedgerReconciliationResult;

/** Optional admin repair: realign stored ledger with event-derived expected values. */
export async function runAdminTreasuryReconcile(): Promise<AdminTreasuryReconcileResult> {
  return reconcileTreasuryLedgerFromExpected();
}
