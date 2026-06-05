import type { InvestmentDisplayKind } from "@/services/admin/investmentAdminTypes";

export function investmentRowDomId(
  investmentId: string,
  displayKind: InvestmentDisplayKind
) {
  return `investment-row-${investmentId}-${displayKind}`;
}

export function investmentShortId(investmentId: string) {
  return investmentId.slice(-6);
}
