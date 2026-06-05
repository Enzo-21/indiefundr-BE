"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { getAdminQueue } from "@/services/admin/treasury";

export async function getAdminQueueSnapshot() {
  return withAdminAction(async () => getAdminQueue());
}
