import { prisma } from "@/lib/prisma";

/** Lazy-init watermark from existing chain rows so incremental sync can resume. */
export async function ensureWalletChainSyncWatermark(
  walletId: string
): Promise<{
  chainSyncedThroughAt: Date | null;
  chainSyncBackfillComplete: boolean;
}> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: {
      chainSyncedThroughAt: true,
      chainSyncBackfillComplete: true,
      activitySyncedAt: true,
    },
  });
  if (!wallet) {
    return { chainSyncedThroughAt: null, chainSyncBackfillComplete: false };
  }

  if (wallet.chainSyncedThroughAt != null) {
    return {
      chainSyncedThroughAt: wallet.chainSyncedThroughAt,
      chainSyncBackfillComplete: wallet.chainSyncBackfillComplete,
    };
  }

  const agg = await prisma.walletChainTransfer.aggregate({
    where: { walletId },
    _max: { chainDate: true },
  });
  const maxChainDate = agg._max.chainDate;

  if (maxChainDate) {
    await prisma.wallet.update({
      where: { id: walletId },
      data: { chainSyncedThroughAt: maxChainDate },
    });
    return {
      chainSyncedThroughAt: maxChainDate,
      chainSyncBackfillComplete: wallet.chainSyncBackfillComplete,
    };
  }

  if (wallet.activitySyncedAt) {
    await prisma.wallet.update({
      where: { id: walletId },
      data: {
        chainSyncedThroughAt: wallet.activitySyncedAt,
        chainSyncBackfillComplete: true,
      },
    });
    return {
      chainSyncedThroughAt: wallet.activitySyncedAt,
      chainSyncBackfillComplete: true,
    };
  }

  return { chainSyncedThroughAt: null, chainSyncBackfillComplete: false };
}

export async function persistChainSyncWatermark(
  walletId: string,
  chainDates: Date[],
  backfillComplete: boolean
): Promise<Date | null> {
  if (!chainDates.length && !backfillComplete) {
    return null;
  }

  const batchMax = chainDates.length
    ? new Date(Math.max(...chainDates.map((d) => d.getTime())))
    : null;

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { chainSyncedThroughAt: true },
  });

  let nextWatermark = wallet?.chainSyncedThroughAt ?? null;
  if (batchMax) {
    nextWatermark =
      !nextWatermark || batchMax > nextWatermark ? batchMax : nextWatermark;
  }

  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      ...(nextWatermark ? { chainSyncedThroughAt: nextWatermark } : {}),
      ...(backfillComplete ? { chainSyncBackfillComplete: true } : {}),
    },
  });

  return nextWatermark;
}
