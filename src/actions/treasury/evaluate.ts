"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import {
  runAdminTreasuryEvaluate,
  type AdminTreasuryEvaluateResult,
} from "@/services/admin/treasuryEvaluate";

export type EvaluateTreasuryResult = AdminTreasuryEvaluateResult;

export async function triggerEvaluate() {
  return withAdminAction(() => runAdminTreasuryEvaluate());
}
