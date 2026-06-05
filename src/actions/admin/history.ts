"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { getAdminHistory } from "@/services/admin/history";

export async function fetchAdminHistory(limit = 100) {
  return withAdminAction(() => getAdminHistory({ limit }));
}
