"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { adminGetQuoteRate } from "@/actions/admin/quoteRates";
import { adminRefreshQuoteRate } from "@/actions/admin/quoteRatesRefresh";
import {
  ADMIN_QUOTE_PAIRS,
  DEFAULT_ADMIN_QUOTE_PAIR_ID,
  type AdminQuotePairId,
  type AdminQuoteRateDto,
} from "@/services/quotes/adminQuotePairRegistry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatRate(rate: number | null, quote: string): string {
  if (rate == null || !Number.isFinite(rate)) {
    return "—";
  }
  return `${rate.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })} ${quote}`;
}

function formatFetchedAt(iso: string | null): string {
  if (!iso) return "Never fetched";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function DashboardQuoteRatesCard() {
  const [pairId, setPairId] = useState<AdminQuotePairId>(
    DEFAULT_ADMIN_QUOTE_PAIR_ID
  );
  const [quote, setQuote] = useState<AdminQuoteRateDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPair = useCallback(async (nextPairId: AdminQuotePairId) => {
    setLoading(true);
    try {
      const result = await adminGetQuoteRate(nextPairId);
      if (result.ok) {
        setQuote(result.data);
        setLoadError(null);
      } else {
        setQuote(null);
        setLoadError(result.error.msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPair(pairId);
  }, [pairId, loadPair]);

  const selectedMeta =
    ADMIN_QUOTE_PAIRS.find((pair) => pair.id === pairId) ?? ADMIN_QUOTE_PAIRS[0];

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await adminRefreshQuoteRate(pairId);
      if (result.ok) {
        setQuote(result.data);
        setLoadError(null);
        toast.success(
          result.data.rate != null
            ? `Quote updated · ${formatRate(result.data.rate, result.data.quote)}`
            : "Quote refreshed"
        );
      } else {
        toast.error(result.error.msg);
        await loadPair(pairId);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const statusVariant =
    quote?.status === "available" && !quote.stale
      ? "success"
      : quote?.status === "available" && quote.stale
        ? "warning"
        : "destructive";

  const statusLabel =
    quote?.status === "available" && !quote.stale
      ? "Available"
      : quote?.status === "available" && quote.stale
        ? "Stale"
        : "Unavailable";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
        <div className="space-y-1">
          <CardDescription>Exchange rate</CardDescription>
          <CardTitle className="text-2xl tabular-nums">
            {loading && !quote
              ? "…"
              : formatRate(
                  quote?.rate ?? null,
                  quote?.quote ?? selectedMeta.quote
                )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            per 1 {quote?.base ?? selectedMeta.base}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={cn(
              "h-7 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium outline-none",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              "disabled:opacity-50"
            )}
            value={pairId}
            disabled={loading || refreshing}
            onChange={(event) =>
              setPairId(event.target.value as AdminQuotePairId)
            }
            aria-label="Quote currency pair"
          >
            {ADMIN_QUOTE_PAIRS.map((pair) => (
              <option key={pair.id} value={pair.id}>
                {pair.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              void onRefresh();
            }}
          >
            <RefreshCw
              className={cn("size-3.5", refreshing && "animate-spin")}
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 text-xs text-muted-foreground">
        {loadError ? (
          <p className="text-destructive">{loadError}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant}>{statusLabel}</Badge>
              {quote?.source ? (
                <span>
                  Source: {quote.source}
                  {quote.sourceDetail ? ` · ${quote.sourceDetail}` : ""}
                </span>
              ) : null}
            </div>
            <p>Fetched {formatFetchedAt(quote?.fetchedAt ?? null)}</p>
            {quote?.stale && quote.status === "available" ? (
              <p className="text-amber-700 dark:text-amber-300">
                Quote is older than 15 minutes — refresh recommended.
              </p>
            ) : null}
            {quote?.lastError && quote.status !== "available" ? (
              <p className="break-words font-mono text-[11px] text-muted-foreground/90">
                {quote.lastError}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
