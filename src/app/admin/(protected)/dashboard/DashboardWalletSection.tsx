"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  fetchAdminWalletStats,
  fetchTronLimiterDiagnostics,
  triggerAdminWalletSync,
} from "@/actions/admin/dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminWalletStatsPayload } from "@/services/admin/dashboardWalletStats";
import { DashboardFundedUsersTable } from "./DashboardFundedUsersTable";
import { DashboardSyncBanner } from "./DashboardSyncBanner";
import { DashboardWalletStatsPanel } from "./DashboardWalletStatsPanel";
import {
  adminErrorDescription,
  adminErrorTitle,
  type AdminActionError,
} from "./dashboardAdminErrors";

const REFRESH_MS = 20_000;
const MAX_SYNC_POLL_MS = 2 * 60 * 1000;

type TronLimiterSnapshot = {
  rpsLimit: number;
  queuedRequests: number;
  inFlightRequests: number;
  retryCount: number;
  rateLimit429Count: number;
  cacheHits: number;
  cacheMisses: number;
  successfulResponses: number;
  failedResponses: number;
  totalRequests: number;
};

export function DashboardWalletSection() {
  const [payload, setPayload] = useState<AdminWalletStatsPayload | null>(null);
  const [error, setError] = useState<AdminActionError | null>(null);
  const [limiter, setLimiter] = useState<TronLimiterSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const syncTriggeredRef = useRef(false);
  const pollStartedAtRef = useRef<number | null>(null);

  const loadWalletStats = useCallback(async () => {
    const result = await fetchAdminWalletStats(15);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setError(null);
    setPayload(result.data);
    return result.data;
  }, []);

  const loadLimiter = useCallback(async () => {
    const result = await fetchTronLimiterDiagnostics();
    if (!result.ok) return;
    const { stats, config } = result.data.tronLimiter;
    setLimiter({
      rpsLimit: config.rpsLimit,
      queuedRequests: stats.queuedRequests,
      inFlightRequests: stats.inFlightRequests,
      retryCount: stats.retryCount,
      rateLimit429Count: stats.rateLimit429Count,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      successfulResponses: stats.successfulResponses,
      failedResponses: stats.failedResponses,
      totalRequests: stats.totalRequests,
    });
  }, []);

  const refreshAll = useCallback(
    (options?: { triggerSync?: boolean }) => {
      startTransition(async () => {
        if (options?.triggerSync) {
          await triggerAdminWalletSync();
        }
        await Promise.all([loadWalletStats(), loadLimiter()]);
      });
    },
    [loadLimiter, loadWalletStats]
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsLoading(true);
      const data = await loadWalletStats();
      void loadLimiter();
      if (cancelled) return;
      setIsLoading(false);

      if (data?.aggregates.syncMeta.isStale && !syncTriggeredRef.current) {
        syncTriggeredRef.current = true;
        pollStartedAtRef.current = Date.now();
        await triggerAdminWalletSync();
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadLimiter, loadWalletStats]);

  useEffect(() => {
    if (!payload?.aggregates.syncMeta.isStale) {
      pollStartedAtRef.current = null;
      return;
    }

    if (pollStartedAtRef.current == null) {
      pollStartedAtRef.current = Date.now();
    }

    const interval = window.setInterval(() => {
      const startedAt = pollStartedAtRef.current ?? Date.now();
      if (Date.now() - startedAt > MAX_SYNC_POLL_MS) {
        window.clearInterval(interval);
        return;
      }
      refreshAll();
    }, REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [payload?.aggregates.syncMeta.isStale, refreshAll]);

  return (
    <div className="space-y-6">
      <DashboardSyncBanner
        syncMeta={payload?.aggregates.syncMeta ?? null}
        isLoading={isLoading}
        isRefreshing={isPending}
        onRefresh={() => {
          syncTriggeredRef.current = true;
          pollStartedAtRef.current = Date.now();
          refreshAll({ triggerSync: true });
        }}
      />

      {error && !payload ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p className="font-medium">
            {adminErrorTitle(error, "Wallet stats unavailable")}
          </p>
          <p>{adminErrorDescription(error)}</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardWalletStatsPanel
          aggregates={payload?.aggregates ?? null}
          isLoading={isLoading}
        />
        {isLoading || !limiter ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Tron limiter</CardDescription>
              <CardTitle className="text-2xl">{limiter.rpsLimit} req/s</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
              <p>
                queued: {limiter.queuedRequests} · inFlight: {limiter.inFlightRequests}
              </p>
              <p>
                retries: {limiter.retryCount} · 429s: {limiter.rateLimit429Count}
              </p>
              <p>
                cache hit/miss: {limiter.cacheHits}/{limiter.cacheMisses}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <DashboardFundedUsersTable
        fundedUsers={payload?.fundedUsers ?? []}
        error={error}
        isLoading={isLoading}
      />
    </div>
  );
}
