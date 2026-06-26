"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  fetchAdminInvestments,
  fetchAdminPayoutSummary,
} from "@/actions/admin/dashboard";
import { LiveCountdown } from "@/app/admin/_components/LiveCountdown";
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
import { INVESTMENT_FUNDS } from "@/lib/config/investmentFunds";
import { buildInvestmentReasonNote } from "@/lib/admin/investmentReasonNotes";
import { shouldShowInvestmentMaturityCountdown } from "@/lib/admin/investmentMaturityCountdown";
import {
  investmentRowDomId,
  investmentShortId,
} from "@/lib/admin/investmentTableIds";
import { formatPayoutRowStatusLabel } from "@/lib/admin/payoutRowLabels";
import { formatRelativeSince } from "@/lib/admin/formatRelativeSince";
import {
  badgeVariantForInvestmentStatus,
  badgeVariantForLedgerEventKind,
  badgeVariantForPayoutStatus,
} from "@/lib/admin/statusBadges";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import type {
  AdminInvestmentDisplayRow,
  AdminInvestmentsListResult,
} from "@/services/admin/investmentAdminTypes";
import type {
  AdminInvestmentsView,
  ListAdminInvestmentsOptions,
} from "@/services/admin/adminInvestmentListQuery";
import type { InvestmentLedgerSnapshot } from "@/services/admin/investmentLedgerSnapshots";
import { cn } from "@/lib/utils";
import { InvestmentPayoutActions } from "./InvestmentPayoutActions";
import { InvestmentReasonCell } from "./InvestmentReasonCell";
import { InvestmentsPayoutStatusBar } from "./InvestmentsPayoutStatusBar";
import { PayoutRowTargetIdLink } from "./PayoutRowTargetIdLink";

const REFRESH_MS = 20_000;
const TABLE_COLUMN_COUNT = 18;

const LEDGER_CONTINGENT_TOOLTIP =
  "Treasury at this event; pending payout(s) above not applied yet.";

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

function PendingLedgerCell() {
  return (
    <div className="text-center text-muted-foreground">
      <div className="text-xs font-medium">Pending</div>
      <div className="mt-0.5 text-[10px]">Awaiting payout</div>
    </div>
  );
}

function ContingentLedgerValue({
  contingent,
  children,
}: {
  contingent: boolean;
  children: ReactNode;
}) {
  if (!contingent) {
    return <>{children}</>;
  }
  return (
    <span className="text-muted-foreground/70" title={LEDGER_CONTINGENT_TOOLTIP}>
      {children}
    </span>
  );
}

function formatLedgerValue(ledger: InvestmentLedgerSnapshot | null) {
  if (!ledger) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span>{formatUsdtDisplay(ledger.pool)}</span>;
}

function formatSurplusDeltaLabel(delta: number) {
  const formatted = formatUsdtDisplay(delta);
  return delta > 0 ? `+${formatted}` : formatted;
}

function SurplusLedgerCell({
  ledger,
  delta,
  showDelta = true,
}: {
  ledger: InvestmentLedgerSnapshot | null;
  delta: number | null;
  showDelta?: boolean;
}) {
  if (!ledger) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      {showDelta && delta != null && delta !== 0 ? (
        <span
          className={cn(
            "font-mono text-[9px] leading-none",
            delta > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400"
          )}
        >
          {formatSurplusDeltaLabel(delta)}
        </span>
      ) : null}
      <span>{formatUsdtDisplay(ledger.surplus)}</span>
    </div>
  );
}

function formatProtectedValue(ledger: InvestmentLedgerSnapshot | null) {
  if (!ledger) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span>{formatUsdtDisplay(ledger.protectedWithdrawable)}</span>;
}

function formatUsdtAmount(value: number) {
  return `${formatUsdtDisplay(value)} USDT`;
}

function formatEventKind(kind: AdminInvestmentDisplayRow["eventKind"]) {
  switch (kind) {
    case "subscription":
      return "subscription";
    case "surplus_payout":
      return "Surplus payout";
    case "payout":
      return "payout";
    default:
      return kind;
  }
}

function payoutDisplayRowLabel(
  eventKind: AdminInvestmentDisplayRow["eventKind"]
): string {
  return eventKind === "surplus_payout" ? "Surplus payout" : "Payout";
}

type InvestmentsTableProps = {
  initialData: AdminInvestmentsListResult;
  limit?: number;
};

export function InvestmentsTable({
  initialData,
  limit = 100,
}: InvestmentsTableProps) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<AdminInvestmentsView>(
    initialData.pageInfo.view
  );
  const [fundId, setFundId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());

  const listOptions = useCallback(
    (overrides: Partial<ListAdminInvestmentsOptions> = {}): ListAdminInvestmentsOptions => ({
      limit,
      view,
      fundId: fundId || undefined,
      ...overrides,
    }),
    [fundId, limit, view]
  );

  const applySnapshot = useCallback((snapshot: AdminInvestmentsListResult) => {
    setData(snapshot);
    setNowIso(new Date().toISOString());
    setError(null);
  }, []);

  const refreshFirstPage = useCallback(async () => {
    const [listResult, summaryResult] = await Promise.all([
      fetchAdminInvestments(listOptions()),
      fetchAdminPayoutSummary(),
    ]);

    if (!listResult.ok) {
      setError(listResult.error.msg);
      return;
    }

    if (summaryResult.ok) {
      applySnapshot({
        ...listResult.data,
        currentLedger: summaryResult.data.currentLedger,
        payoutAvailability: summaryResult.data.payoutAvailability,
      });
      return;
    }

    applySnapshot(listResult.data);
  }, [applySnapshot, listOptions]);

  const loadMore = useCallback(() => {
    if (!data.pageInfo.hasMore || !data.pageInfo.nextCursor) {
      return;
    }

    startTransition(async () => {
      const result = await fetchAdminInvestments(
        listOptions({ cursor: data.pageInfo.nextCursor ?? undefined })
      );
      if (!result.ok) {
        setError(result.error.msg);
        return;
      }

      setData((current) => ({
        ...result.data,
        displayRows: [...current.displayRows, ...result.data.displayRows],
        rows: [...current.rows, ...result.data.rows],
        currentLedger: result.data.currentLedger,
        payoutAvailability: result.data.payoutAvailability,
      }));
      setError(null);
    });
  }, [data.pageInfo.hasMore, data.pageInfo.nextCursor, listOptions]);

  const switchView = useCallback(
    (nextView: AdminInvestmentsView) => {
      setView(nextView);
      startTransition(async () => {
        const result = await fetchAdminInvestments({
          limit,
          view: nextView,
          fundId: fundId || undefined,
        });
        if (result.ok) {
          applySnapshot(result.data);
        } else {
          setError(result.error.msg);
        }
      });
    },
    [applySnapshot, fundId, limit]
  );

  const applyFundFilter = useCallback(
    (nextFundId: string) => {
      setFundId(nextFundId);
      startTransition(async () => {
        const result = await fetchAdminInvestments({
          limit,
          view,
          fundId: nextFundId || undefined,
        });
        if (result.ok) {
          applySnapshot(result.data);
        } else {
          setError(result.error.msg);
        }
      });
    },
    [applySnapshot, limit, view]
  );

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const [listResult, summaryResult] = await Promise.all([
        fetchAdminInvestments(listOptions()),
        fetchAdminPayoutSummary(),
      ]);
      if (cancelled) return;

      if (!listResult.ok) {
        setError(listResult.error.msg);
        return;
      }

      if (summaryResult.ok) {
        applySnapshot({
          ...listResult.data,
          currentLedger: summaryResult.data.currentLedger,
          payoutAvailability: summaryResult.data.payoutAvailability,
        });
        return;
      }

      applySnapshot(listResult.data);
    }

    const interval = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [applySnapshot, listOptions]);

  const emptyMessage =
    view === "archive"
      ? "No paid or archived investments on this page."
      : "No open investments on this page.";

  return (
    <div className="space-y-4">
      <InvestmentsPayoutStatusBar
        currentLedger={data.currentLedger}
        payoutAvailability={data.payoutAvailability}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={view === "queue" ? "default" : "outline"}
            disabled={isPending}
            onClick={() => switchView("queue")}
          >
            Action queue
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "archive" ? "default" : "outline"}
            disabled={isPending}
            onClick={() => switchView("archive")}
          >
            Paid / archive
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Fund
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm text-foreground"
            value={fundId}
            disabled={isPending}
            onChange={(event) => applyFundFilter(event.target.value)}
          >
            <option value="">All funds</option>
            {INVESTMENT_FUNDS.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
        </label>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await refreshFirstPage();
            });
          }}
        >
          Refresh
        </Button>

        {isPending ? (
          <span className="text-xs text-muted-foreground">Updating…</span>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Timeline</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Return %</TableHead>
              <TableHead>Investment</TableHead>
              <TableHead>Payout</TableHead>
              <TableHead>Pool</TableHead>
              <TableHead>Surplus</TableHead>
              <TableHead>Withdrawable</TableHead>
              <TableHead>Maturity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payout status</TableHead>
              <TableHead>User path</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.displayRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.displayRows.map((row) => {
                const isPayout = row.displayKind === "payout";
                const inv = row.investment;
                const parent = row.parentInvestment;

                return (
                  <TableRow
                    key={row.rowKey}
                    id={investmentRowDomId(row.investmentId, row.displayKind)}
                    className={cn(isPayout && "bg-muted/40")}
                  >
                    <TableCell className="font-mono text-xs">
                      {row.chronologicalStep}
                    </TableCell>
                    <TableCell>
                      {isPayout ? (
                        <PayoutRowTargetIdLink investmentId={row.investmentId} />
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {investmentShortId(row.investmentId)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isPayout ? (
                        <>
                          <div className="text-sm font-medium">
                            {row.subscribedColumnHint ??
                              payoutDisplayRowLabel(row.eventKind)}
                          </div>
                          {row.subscribedAtIso ? (
                            <div className="font-mono text-xs text-muted-foreground">
                              {formatRelativeSince(row.subscribedAtIso)}
                            </div>
                          ) : null}
                        </>
                      ) : row.subscribedAtIso ? (
                        <>
                          <div className="text-sm">
                            {formatRelativeSince(row.subscribedAtIso)}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {row.subscribedAtIso}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div
                        className={cn(
                          "font-medium",
                          isPayout && "text-muted-foreground"
                        )}
                      >
                        {row.userEmail}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isPayout
                          ? payoutDisplayRowLabel(row.eventKind)
                          : row.userName}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(isPayout && "text-muted-foreground")}
                    >
                      {row.fundName}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={badgeVariantForLedgerEventKind(row.eventKind)}
                      >
                        {formatEventKind(row.eventKind)}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.returnPercent90d}%</TableCell>
                    <TableCell>
                      {isPayout ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatUsdtAmount(row.amountUsdt)
                      )}
                    </TableCell>
                    <TableCell>
                      {isPayout
                        ? formatUsdtAmount(row.amountUsdt)
                        : inv
                          ? formatUsdtAmount(inv.projectedPayoutUsdt)
                          : "—"}
                    </TableCell>
                    <TableCell>
                      {row.ledgerPending ? (
                        <PendingLedgerCell />
                      ) : (
                        <ContingentLedgerValue contingent={row.ledgerContingent}>
                          {formatLedgerValue(row.ledger)}
                        </ContingentLedgerValue>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.ledgerPending ? (
                        <PendingLedgerCell />
                      ) : (
                        <ContingentLedgerValue contingent={row.ledgerContingent}>
                          <SurplusLedgerCell
                            ledger={row.ledger}
                            delta={row.ledgerSurplusDelta}
                            showDelta={
                              !row.ledgerPending && !row.ledgerContingent
                            }
                          />
                        </ContingentLedgerValue>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.ledgerPending ? (
                        <PendingLedgerCell />
                      ) : (
                        <ContingentLedgerValue contingent={row.ledgerContingent}>
                          {formatProtectedValue(row.ledger)}
                        </ContingentLedgerValue>
                      )}
                    </TableCell>
                    {isPayout && parent ? (
                      <>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell>
                          <Badge
                            variant={badgeVariantForPayoutStatus(
                              parent.payoutStatus
                            )}
                          >
                            {formatPayoutRowStatusLabel(parent.payoutStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={badgeVariantForPayoutStatus(
                              parent.payoutStatus
                            )}
                          >
                            {parent.payoutStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {parent.userPathLabel !== "None"
                            ? parent.userPathLabel
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                      </>
                    ) : inv ? (
                      <>
                        <TableCell>
                          <div>{formatDate(inv.maturesAt)}</div>
                          {shouldShowInvestmentMaturityCountdown(inv) ? (
                            <LiveCountdown
                              target={inv.maturesAt}
                              nowIso={nowIso}
                            />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={badgeVariantForInvestmentStatus(inv.status)}
                          >
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={badgeVariantForPayoutStatus(inv.payoutStatus)}
                          >
                            {inv.payoutStatus}
                          </Badge>
                          {inv.payoutFailureReason ? (
                            <div className="mt-1 text-xs text-destructive">
                              {inv.payoutFailureReason}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{inv.userPathLabel}</Badge>
                          {inv.nextDeadlineAt && inv.nextDeadlineLabel ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {inv.nextDeadlineLabel}: {formatDate(inv.nextDeadlineAt)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <InvestmentReasonCell
                            note={buildInvestmentReasonNote(inv)}
                            investmentId={inv.id}
                          />
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                      </>
                    )}
                    <TableCell>
                      {isPayout ? (
                        <span className="text-muted-foreground">—</span>
                      ) : inv ? (
                        <InvestmentPayoutActions row={inv} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {data.pageInfo.hasMore ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={loadMore}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
