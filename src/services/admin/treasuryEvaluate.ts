import { evaluateAll } from "@/services/revenueEngine/evaluateAll";

export type AdminTreasuryEvaluateResult = {
  updated: number;
  headId: string | null;
  poolAvailable?: number;
};

/** Re-evaluate global payout queue ranks (no ledger auto-reconcile). */
export async function runAdminTreasuryEvaluate(): Promise<AdminTreasuryEvaluateResult> {
  const result = await evaluateAll();
  return {
    updated: result.updated,
    headId: result.headId ?? null,
    poolAvailable: result.poolAvailable,
  };
}

/** @deprecated Auto-reconcile removed — use runAdminTreasuryEvaluate. */
export async function runAdminTreasuryReconcile(): Promise<never> {
  throw new Error(
    "Treasury auto-reconcile is disabled. The ledger is event-sourced; use Evaluate payout queue instead."
  );
}
