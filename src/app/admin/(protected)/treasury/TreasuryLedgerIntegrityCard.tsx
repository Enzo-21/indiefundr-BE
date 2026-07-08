import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import type { SubscribeInflowDiagnostics } from "@/services/admin/subscribeInflowDiagnostics";
import { computeWithdrawableFromLedgerFields } from "@/services/revenueEngine/ledger";
import type { LedgerIntegrityReport } from "@/services/revenueEngine/ledgerReconcile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type LedgerRow = {
  label: string;
  stored: number;
  expected: number;
};

function LedgerCompareTable({
  rows,
  expectedHeader = "Expected",
}: {
  rows: LedgerRow[];
  expectedHeader?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Field</th>
            <th className="pb-2 pr-4 font-medium text-right">Stored</th>
            <th className="pb-2 font-medium text-right">{expectedHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const differs =
              formatUsdtDisplay(row.stored) !== formatUsdtDisplay(row.expected);
            return (
              <tr key={row.label} className="border-b border-border/50">
                <td className="py-2 pr-4">{row.label}</td>
                <td
                  className={`py-2 pr-4 text-right font-mono ${differs ? "text-amber-600 dark:text-amber-500" : ""}`}
                >
                  {formatUsdtDisplay(row.stored)}
                </td>
                <td className="py-2 text-right font-mono">
                  {formatUsdtDisplay(row.expected)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TreasuryLedgerIntegrityCard({
  report,
  subscribeDiagnostics,
}: {
  report: LedgerIntegrityReport;
  subscribeDiagnostics?: SubscribeInflowDiagnostics;
}) {
  const {
    stored,
    expected,
    cohortExpected,
    mismatch,
    cohortMismatch,
    forfeitureImpact,
    confirmedSubscriptionCount,
  } = report;

  const primaryRows: LedgerRow[] = [
    {
      label: "Pool available",
      stored: stored.poolAvailable,
      expected: expected.poolAvailable,
    },
    {
      label: "Treasury surplus",
      stored: stored.treasurySurplus,
      expected: expected.treasurySurplus,
    },
    {
      label: "Withdrawable (pool − surplus)",
      stored: computeWithdrawableFromLedgerFields(stored)
        .protectedRevenueAvailable,
      expected: computeWithdrawableFromLedgerFields(expected)
        .protectedRevenueAvailable,
    },
    {
      label: "Platform withdrawn",
      stored: stored.protectedRevenueWithdrawn,
      expected: expected.protectedRevenueWithdrawn,
    },
  ];

  const cohortRows: LedgerRow[] = [
    {
      label: "Pool available",
      stored: stored.poolAvailable,
      expected: cohortExpected.poolAvailable,
    },
    {
      label: "Treasury surplus",
      stored: stored.treasurySurplus,
      expected: cohortExpected.treasurySurplus,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ledger diagnostic (read-only)</CardTitle>
        <CardDescription>
          Compares stored ledger to an event replay of all treasury events.
          Does not auto-adjust stored values. On-chain wallet balance is not
          included in pool or surplus.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {confirmedSubscriptionCount} active-cohort subscription
          {confirmedSubscriptionCount === 1 ? "" : "s"} (excludes forfeited).
        </p>
        <LedgerCompareTable
          rows={primaryRows}
          expectedHeader="Expected (event replay)"
        />
        {forfeitureImpact.count > 0 ? (
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <p>
              {forfeitureImpact.count} forfeited investment
              {forfeitureImpact.count === 1 ? "" : "s"} retain{" "}
              {formatUsdtDisplay(forfeitureImpact.principalTotal)} USDT principal
              and {formatUsdtDisplay(forfeitureImpact.surplusSliceTotal)} USDT
              surplus slice in the pool by design.
            </p>
            {cohortMismatch && !mismatch ? (
              <p className="mt-1">
                The legacy cohort formula below would under-count pool by{" "}
                {formatUsdtDisplay(forfeitureImpact.poolCohortDrift)} USDT
                (informational).
              </p>
            ) : null}
          </div>
        ) : null}
        {cohortMismatch ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Legacy cohort formula (informational)
            </p>
            <LedgerCompareTable rows={cohortRows} expectedHeader="Cohort expected" />
          </div>
        ) : null}
        {subscribeDiagnostics ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Subscribe inflow events: {subscribeDiagnostics.subscribeInflowEventCount}{" "}
              / {subscribeDiagnostics.completedInvestmentCount} completed investments
              {subscribeDiagnostics.missingSubscribeInflowCount > 0 ? (
                <span className="text-amber-600 dark:text-amber-500">
                  {" "}
                  ({subscribeDiagnostics.missingSubscribeInflowCount} missing — ledger
                  behind chain until inflows are recorded)
                </span>
              ) : null}
            </p>
            {subscribeDiagnostics.csvExpectedAtAggressiveCount ? (
              <p className="text-muted-foreground">
                Aggressive Alpha CSV expectation after{" "}
                {subscribeDiagnostics.aggressiveAlphaCompletedCount} subscriptions
                (replay): pool{" "}
                {formatUsdtDisplay(
                  subscribeDiagnostics.csvExpectedAtAggressiveCount.poolAvailable
                )}
                , surplus{" "}
                {formatUsdtDisplay(
                  subscribeDiagnostics.csvExpectedAtAggressiveCount.treasurySurplus
                )}
                , withdrawable{" "}
                {formatUsdtDisplay(
                  subscribeDiagnostics.csvExpectedAtAggressiveCount
                    .protectedWithdrawable
                )}
                . On-chain USDT tracks user payments minus payouts; it is not the
                internal pool.
              </p>
            ) : null}
          </div>
        ) : null}
        {mismatch ? (
          <Alert variant="destructive">
            <AlertTitle>Stored ledger differs from event replay</AlertTitle>
            <AlertDescription>
              Investigate missing or duplicate treasury events and subscribe
              inflows. Auto-reconcile is disabled — pool updates come from app
              events only.
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">
            Stored ledger matches event replay expectations.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
