import { authorizeCronRequest } from "@/lib/cron/authorizeCronRequest";
import {
  FORFEITURE_CRON_BATCH_SIZE,
  processInvestmentForfeitures,
} from "@/services/investments/investmentForfeiture";
import {
  markMaturedInvestments,
  MATURITY_CRON_BATCH_SIZE,
} from "@/services/investments/maturity";
import { notifyMaturedInvestments } from "@/services/investments/maturityNotifications";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorizeCronRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const { count, matured, pendingCount } = await markMaturedInvestments({
    limit: MATURITY_CRON_BATCH_SIZE,
  });

  const {
    count: forfeitedCount,
    forfeitedIds,
    pendingCount: forfeiturePendingCount,
  } = await processInvestmentForfeitures({
    limit: FORFEITURE_CRON_BATCH_SIZE,
  });

  const { notifiedCount, skippedNoDevice } =
    count > 0
      ? await notifyMaturedInvestments(matured)
      : { notifiedCount: 0, skippedNoDevice: 0 };

  return Response.json({
    ok: true,
    maturedCount: count,
    pendingCount,
    forfeitedCount,
    forfeiturePendingCount,
    forfeitedIds,
    batchLimit: MATURITY_CRON_BATCH_SIZE,
    forfeitureBatchLimit: FORFEITURE_CRON_BATCH_SIZE,
    notifiedCount,
    skippedNoDevice,
    maturedIds: matured.map((row) => row.id),
    startedAt,
    finishedAt: new Date().toISOString(),
  });
}
