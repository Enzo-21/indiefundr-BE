"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { getAdminEvents } from "@/services/admin/treasury";

export async function listTreasuryEvents(limit = 50) {
  return withAdminAction(async () => getAdminEvents(limit));
}
