"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { refreshAdminQuoteRate } from "@/services/quotes/adminQuoteRateRefresh";

export async function adminRefreshQuoteRate(pairId: string) {
  return withAdminAction(() => refreshAdminQuoteRate(pairId));
}
