"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import {
  DEFAULT_ADMIN_QUOTE_PAIR_ID,
  getAdminQuoteRate,
} from "@/services/quotes/adminQuoteRates";

export async function adminGetQuoteRate(pairId?: string) {
  return withAdminAction(() =>
    getAdminQuoteRate(pairId ?? DEFAULT_ADMIN_QUOTE_PAIR_ID)
  );
}
