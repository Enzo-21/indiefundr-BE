const inFlight = new Map<
  string,
  { userId: string; reason: string; startedAt: number }
>();

export function isWalletSyncInFlight(walletId: string): boolean {
  return inFlight.has(walletId);
}

export function getWalletSyncInFlightSnapshot(): Array<{
  walletId: string;
  userId: string;
  reason: string;
  elapsedMs: number;
}> {
  const now = Date.now();
  return Array.from(inFlight.entries()).map(([walletId, job]) => ({
    walletId,
    userId: job.userId,
    reason: job.reason,
    elapsedMs: now - job.startedAt,
  }));
}

export async function runWalletSyncInBackground(
  userId: string,
  walletId: string,
  reason: string,
  syncFn: () => Promise<unknown>
): Promise<boolean> {
  if (inFlight.has(walletId)) {
    console.log("[wallet:sync] skip already in flight", {
      walletId,
      userId,
      reason,
      active: inFlight.get(walletId)?.reason,
      elapsedMs: Date.now() - (inFlight.get(walletId)?.startedAt ?? 0),
    });
    return false;
  }

  inFlight.set(walletId, { userId, reason, startedAt: Date.now() });
  console.log("[wallet:sync] start", { walletId, userId, reason });

  void (async () => {
    try {
      const result = await syncFn();
      const elapsedMs = Date.now() - (inFlight.get(walletId)?.startedAt ?? Date.now());
      console.log("[wallet:sync] complete", {
        walletId,
        userId,
        reason,
        elapsedMs,
        result,
      });
    } catch (error) {
      const elapsedMs = Date.now() - (inFlight.get(walletId)?.startedAt ?? Date.now());
      console.error("[wallet:sync] failed", {
        walletId,
        userId,
        reason,
        elapsedMs,
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      inFlight.delete(walletId);
      console.log("[wallet:sync] in-flight cleared", { walletId, userId, reason });
    }
  })();

  return true;
}
