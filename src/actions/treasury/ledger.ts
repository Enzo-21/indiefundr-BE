"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { getAdminLedger } from "@/services/admin/treasury";

export async function getLedgerSnapshot() {
  return withAdminAction(async () => getAdminLedger());
}
