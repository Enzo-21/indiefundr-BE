"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import {
  runAdminTreasuryReconcile,
  type AdminTreasuryReconcileResult,
} from "@/services/admin/treasuryEvaluate";

export type EvaluateTreasuryResult = AdminTreasuryReconcileResult;

/** @deprecated Name kept for UI import — runs ledger reconcile only, not batch evaluate. */
export async function triggerEvaluate() {
  return withAdminAction(() => runAdminTreasuryReconcile());
}
