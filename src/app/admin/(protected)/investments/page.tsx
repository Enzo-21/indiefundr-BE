import type { ReactNode } from "react";
import { fetchAdminInvestments } from "@/actions/admin/dashboard";
import type { AdminInvestmentDisplayRow } from "@/services/admin/investmentAdminTypes";
import type { InvestmentLedgerSnapshot } from "@/services/admin/investmentLedgerSnapshots";
import { formatRelativeSince } from "@/lib/admin/formatRelativeSince";
import {
  badgeVariantForInvestmentStatus,
  badgeVariantForLedgerEventKind,
  badgeVariantForPayoutStatus,
} from "@/lib/admin/statusBadges";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LiveCountdown } from "@/app/admin/_components/LiveCountdown";
import {
  investmentRowDomId,
  investmentShortId,
} from "@/lib/admin/investmentTableIds";
import { buildInvestmentReasonNote } from "@/lib/admin/investmentReasonNotes";
import { formatPayoutRowStatusLabel } from "@/lib/admin/payoutRowLabels";
import { PayoutRowTargetIdLink } from "./PayoutRowTargetIdLink";
import { InvestmentPayoutActions } from "./InvestmentPayoutActions";
import { InvestmentsPayoutStatusBar } from "./InvestmentsPayoutStatusBar";
import { InvestmentReasonCell } from "./InvestmentReasonCell";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABLE_COLUMN_COUNT = 16;

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

const LEDGER_CONTINGENT_TOOLTIP =
  "Treasury at this event; pending payout(s) above not applied yet.";

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

export default async function AdminInvestmentsPage() {
  const result = await fetchAdminInvestments();
  const nowIso = new Date().toISOString();

  if (!result.ok) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{result.error.msg}</AlertDescription>
      </Alert>
    );
  }

  const { displayRows, currentLedger, payoutAvailability } = result.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
        <p className="text-sm text-muted-foreground">
          Chronological rows are subscriptions and completed payouts. Triad
          unlocks show a gray payout row (Pending treasury until paid). When
          two-user unlock is available, use Pay now. Otherwise Pay with surplus
          is offered in subscribe-date FIFO order — only investments that fit
          remaining surplus after earlier candidates qualify. A surplus_payout
          row appears only after you execute that payment. Surplus is shared;
          after each pay the page refreshes so buttons reflect remaining
          surplus (click a payout row ID to jump to its subscription).
        </p>
      </div>

      <InvestmentsPayoutStatusBar
        currentLedger={currentLedger}
        payoutAvailability={payoutAvailability}
      />

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
              <TableHead>Reason</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="text-muted-foreground"
                >
                  No investments yet.
                </TableCell>
              </TableRow>
            ) : (
              displayRows.map((row) => {
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
                      <Badge variant={badgeVariantForLedgerEventKind(row.eventKind)}>
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
                        <TableCell className="text-muted-foreground">—</TableCell>
                      </>
                    ) : inv ? (
                      <>
                        <TableCell>
                          <div>{formatDate(inv.maturesAt)}</div>
                          <LiveCountdown
                            target={inv.maturesAt}
                            nowIso={nowIso}
                          />
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
                          <InvestmentReasonCell
                            note={buildInvestmentReasonNote(inv)}
                          />
                        </TableCell>
                      </>
                    ) : (
                      <>
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
    </div>
  );
}
