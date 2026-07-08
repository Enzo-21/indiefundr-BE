import { authorizeCronRequest } from "@/lib/cron/authorizeCronRequest";
import { getEnv } from "@/lib/env";
import { syncWalletsNeedingWork } from "@/services/wallets/walletSyncService";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorizeCronRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const env = getEnv();
  const { synced } = await syncWalletsNeedingWork(env.walletSyncBatchSize);

  return Response.json({
    ok: true,
    synced,
    batchSize: env.walletSyncBatchSize,
    startedAt,
    finishedAt: new Date().toISOString(),
  });
}
