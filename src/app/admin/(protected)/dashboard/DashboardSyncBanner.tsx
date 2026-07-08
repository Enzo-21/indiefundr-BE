"use client";

import { Loader2 } from "lucide-react";
import type { AdminWalletSyncMeta } from "@/services/admin/dashboardWalletStats";

function formatRelativeSync(value: string | null) {
  if (!value) return "not synced yet";
  const syncedAt = new Date(value).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - syncedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

type DashboardSyncBannerProps = {
  syncMeta: AdminWalletSyncMeta | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
};

export function DashboardSyncBanner({
  syncMeta,
  isLoading,
  isRefreshing,
  onRefresh,
}: DashboardSyncBannerProps) {
  const syncing = isLoading || isRefreshing || syncMeta?.isStale;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {syncing ? (
          <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
        ) : null}
        <p className="text-muted-foreground">
          {syncing
            ? "Syncing with Tron network…"
            : `Wallet data synced ${formatRelativeSync(syncMeta?.lastSyncedAt ?? null)}`}
          {syncMeta && syncMeta.staleWalletCount > 0
            ? ` · ${syncMeta.staleWalletCount} wallet(s) need refresh`
            : null}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="text-primary text-sm font-medium hover:underline disabled:opacity-50"
      >
        Refresh on-chain data
      </button>
    </div>
  );
}
