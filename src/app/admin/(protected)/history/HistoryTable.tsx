"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { fetchAdminHistory } from "@/actions/admin/history";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AdminHistoryRow,
  AdminHistorySnapshot,
} from "@/services/admin/history";
import {
  badgeVariantForHistorySource,
  badgeVariantForHistoryStatus,
} from "@/lib/admin/statusBadges";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { formatPayoutUnlockers, historyRowsToCsv } from "./historyCsv";
import { TreasuryExternalInflowButtons } from "../treasury/TreasuryExternalInflowButtons";

const REFRESH_MS = 20_000;

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function directionPrefix(direction: AdminHistoryRow["direction"]) {
  if (direction === "in") return "+";
  if (direction === "out") return "-";
  return "";
}

function sourceLabel(source: AdminHistoryRow["source"]): string {
  switch (source) {
    case "ledger":
      return "Ledger";
    case "treasury_chain":
      return "Treasury chain";
    case "wallet_chain":
      return "Wallet chain";
  }
}

function downloadCsv(rows: AdminHistoryRow[]) {
  const csv = historyRowsToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replaceAll(":", "-");

  link.href = url;
  link.download = `admin-history-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function HistoryTable({
  initialSnapshot,
  limit = 100,
}: {
  initialSnapshot: AdminHistorySnapshot;
  limit?: number;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshSnapshot = useCallback(async () => {
    const result = await fetchAdminHistory(limit);
    if (result.ok) {
      setSnapshot(result.data);
      setError(null);
    } else {
      setError(result.error.msg);
    }
  }, [limit]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const result = await fetchAdminHistory(limit);
      if (cancelled) return;
      if (result.ok) {
        setSnapshot(result.data);
        setError(null);
      } else {
        setError(result.error.msg);
      }
    }

    const interval = window.setInterval(() => {
      startTransition(() => {
        void refresh();
      });
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [limit]);

  const handleInflowUpdated = useCallback(() => {
    startTransition(() => {
      void refreshSnapshot();
    });
  }, [refreshSnapshot]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div>
          Last updated {formatDate(snapshot.generatedAt)}
          {isPending ? " · Refreshing…" : ""}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>
            {snapshot.rows.length} shown · {snapshot.ledgerEventCount} ledger ·{" "}
            {snapshot.auditTransactionCount} on-chain audit
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={snapshot.rows.length === 0}
            onClick={() => downloadCsv(snapshot.rows)}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <Alert>
        <AlertDescription>
          Source matters: on-chain audit rows are real wallet transfers, while
          ledger rows are internal accounting entries. CSV exports include both
          sources for auditability; calculate totals by source instead of summing
          every row together.
        </AlertDescription>
      </Alert>

      {snapshot.chainHistoryError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Some persisted on-chain history could not be loaded. Internal ledger
            events are still shown.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>User / detail</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead>Pool after</TableHead>
              <TableHead>Surplus after</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground">
                  No transaction history yet.
                </TableCell>
              </TableRow>
            ) : (
              snapshot.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.date)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={badgeVariantForHistorySource(row.source)}>
                      {sourceLabel(row.source)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <span>{row.label}</span>
                      {row.inflowTreatment === "surplus" ? (
                        <Badge variant="neutral" className="text-[10px]">
                          Surplus
                        </Badge>
                      ) : row.inflowTreatment === "withdrawable" ? (
                        <Badge variant="success" className="text-[10px]">
                          Withdrawable
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={badgeVariantForHistoryStatus(row.status)}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {directionPrefix(row.direction)}
                    {formatUsdtDisplay(row.amountUsdt)} USDT
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    {row.userEmail ? (
                      <div className="truncate font-medium">{row.userEmail}</div>
                    ) : null}
                    <div className="truncate text-xs text-muted-foreground">
                      {row.detail ?? "—"}
                    </div>
                    {row.fromAddress || row.toAddress ? (
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {row.fromAddress ? row.fromAddress.slice(0, 8) : "—"} →{" "}
                        {row.toAddress ? row.toAddress.slice(0, 8) : "—"}
                      </div>
                    ) : null}
                    {row.payoutUnlockers.length > 0 ? (
                      <div className="truncate text-xs text-muted-foreground">
                        Made possible by: {formatPayoutUnlockers(row)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {row.tronscanUrl ? (
                      <a
                        href={row.tronscanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium underline-offset-4 hover:underline"
                      >
                        TronScan
                      </a>
                    ) : row.txId ? (
                      <span className="font-mono text-xs">
                        {row.txId.slice(0, 10)}…
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{row.poolAfter ?? "—"}</TableCell>
                  <TableCell>{row.surplusAfter ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {row.txId ? (
                      <TreasuryExternalInflowButtons
                        txId={row.txId}
                        amountUsdt={row.amountUsdt}
                        inflowTreatment={row.inflowTreatment}
                        inflowActionsEligible={row.inflowActionsEligible}
                        onUpdated={handleInflowUpdated}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
