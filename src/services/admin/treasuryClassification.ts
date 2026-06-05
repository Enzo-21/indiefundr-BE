import type { AdminOnChainCategory } from "@/services/admin/historySync";
import type {
  ClassificationSource,
  TreasuryChainCategory,
} from "@/services/admin/treasuryOnChain";

/** Persisted admin overrides for treasury outbound txs only. */
export type AdminWithdrawalCategoryOverride =
  | "treasury_app_withdrawal"
  | "treasury_outflow_untracked";

export const ADMIN_WITHDRAWAL_CATEGORY_OVERRIDES: readonly AdminWithdrawalCategoryOverride[] =
  ["treasury_app_withdrawal", "treasury_outflow_untracked"];

export function isAdminWithdrawalCategoryOverride(
  value: string | null | undefined
): value is AdminWithdrawalCategoryOverride {
  return (
    value === "treasury_app_withdrawal" ||
    value === "treasury_outflow_untracked"
  );
}

export function auditCategoryToTreasuryChain(
  override: AdminWithdrawalCategoryOverride
): { category: TreasuryChainCategory; source: ClassificationSource } {
  switch (override) {
    case "treasury_app_withdrawal":
      return { category: "app_withdrawal", source: "app_tx" };
    case "treasury_outflow_untracked":
      return {
        category: "treasury_outflow_untracked",
        source: "external",
      };
    default: {
      const _exhaustive: never = override;
      return _exhaustive;
    }
  }
}

export function treasuryChainToAuditCategory(
  category: TreasuryChainCategory
): AdminOnChainCategory | null {
  switch (category) {
    case "app_withdrawal":
      return "treasury_app_withdrawal";
    case "treasury_outflow_untracked":
      return "treasury_outflow_untracked";
    default:
      return null;
  }
}

export function auditOverrideToDisplayCategory(
  override: AdminWithdrawalCategoryOverride
): AdminOnChainCategory {
  return override;
}
