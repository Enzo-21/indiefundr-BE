import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { AdminHistoryRow } from "@/services/admin/history";
import type { InvestmentLedgerEventKind } from "@/services/admin/investmentLedgerSnapshots";
import type {
  ClassificationSource,
  TreasuryChainCategory,
} from "@/services/admin/treasuryOnChain";

export type StatusBadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>["variant"]
>;

export function badgeVariantForHistorySource(
  source: AdminHistoryRow["source"]
): StatusBadgeVariant {
  switch (source) {
    case "ledger":
      return "info";
    case "treasury_chain":
      return "payout";
    case "wallet_chain":
      return "neutral";
  }
}

export function badgeVariantForHistoryStatus(
  status: AdminHistoryRow["status"]
): StatusBadgeVariant {
  switch (status) {
    case "confirmed":
      return "success";
    case "pending":
      return "warning";
    case "failed":
      return "destructive";
    case "recorded":
      return "info";
  }
}

export function badgeVariantForTreasuryCategory(
  category: TreasuryChainCategory
): StatusBadgeVariant {
  switch (category) {
    case "user_payment":
      return "info";
    case "user_payout":
      return "payout";
    case "app_withdrawal":
      return "destructive";
    case "external_in":
      return "external";
    case "treasury_outflow_untracked":
      return "neutral";
    case "wallet_match_unconfirmed":
      return "warning";
  }
}

export function badgeVariantForClassificationSource(
  source: ClassificationSource
): StatusBadgeVariant {
  switch (source) {
    case "app_tx":
      return "info";
    case "address_only":
      return "warning";
    case "external":
      return "external";
  }
}

export function badgeVariantForLedgerEventKind(
  kind: InvestmentLedgerEventKind
): StatusBadgeVariant {
  switch (kind) {
    case "subscription":
      return "info";
    case "payout":
      return "payout";
    case "surplus_payout":
      return "surplus";
  }
}

export function badgeVariantForInvestmentStatus(
  status: string
): StatusBadgeVariant {
  switch (status) {
    case "active":
      return "info";
    case "matured":
      return "warning";
    case "redeeming":
      return "warning";
    case "redeemed":
      return "success";
    case "failed":
      return "destructive";
    default:
      return "neutral";
  }
}

export function badgeVariantForPayoutStatus(status: string): StatusBadgeVariant {
  switch (status) {
    case "paid":
      return "success";
    case "paid_surplus":
      return "surplus";
    case "paying":
      return "warning";
    case "paying_surplus":
      return "surplus";
    case "ready":
      return "payout";
    case "waiting":
      return "neutral";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export function badgeVariantForSurplusPayoutStatus(
  status: string
): StatusBadgeVariant {
  switch (status) {
    case "paid":
      return "success";
    case "paying":
      return "warning";
    case "available":
      return "surplus";
    case "insufficient_surplus":
      return "warning";
    case "not_available":
      return "neutral";
    default:
      return "outline";
  }
}

export function badgeVariantForWithdrawalSync(
  inLedger: boolean
): StatusBadgeVariant {
  return inLedger ? "success" : "warning";
}
