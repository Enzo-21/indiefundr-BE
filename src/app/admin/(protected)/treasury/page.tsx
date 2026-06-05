import {
  getAdminQueueSnapshot,
  getLedgerSnapshot,
  getTreasuryOnChainSnapshot,
  listRecordedAppWithdrawals,
  listTreasuryEvents,
} from "@/actions/treasury";
import { EvaluateButton } from "../dashboard/EvaluateButton";
import { triggerEvaluate } from "@/actions/treasury";
import { SyncTreasuryHistoryButton } from "./SyncTreasuryHistoryButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsdtDisplay, formatUsdtDisplayOrDash } from "@/lib/money/formatUsdt";
import { buildTreasuryLedgerHints } from "@/services/revenueEngine/ledgerDisplay";
import { buildSubscribeInflowDiagnostics } from "@/services/admin/subscribeInflowDiagnostics";
import { buildLedgerIntegrityReport } from "@/services/revenueEngine/ledgerReconcile";
import { TreasuryLedgerIntegrityCard } from "./TreasuryLedgerIntegrityCard";
import { TreasuryOnChainSection } from "./TreasuryOnChainSection";
import { TreasuryRecordedWithdrawalsTable } from "./TreasuryRecordedWithdrawalsTable";

export const dynamic = "force-dynamic";

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function AdminTreasuryPage() {
  const [ledgerResult, queueResult, eventsResult, onChainResult, withdrawalsResult] =
    await Promise.all([
      getLedgerSnapshot(),
      getAdminQueueSnapshot(),
      listTreasuryEvents(50),
      getTreasuryOnChainSnapshot(),
      listRecordedAppWithdrawals(),
    ]);

  if (!ledgerResult.ok) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{ledgerResult.error.msg}</AlertDescription>
      </Alert>
    );
  }

  const ledger = ledgerResult.data;
  const [ledgerIntegrity, subscribeDiagnostics] = await Promise.all([
    buildLedgerIntegrityReport(),
    buildSubscribeInflowDiagnostics(),
  ]);
  const treasuryHints = buildTreasuryLedgerHints(ledger);
  const queue = queueResult.ok ? queueResult.data.queue : [];
  const events = eventsResult.ok ? eventsResult.data : [];
  const recordedWithdrawals = withdrawalsResult.ok ? withdrawalsResult.data : [];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Treasury</h1>
          <p className="text-sm text-muted-foreground">
            On-chain wallet balances and USDT history, internal ledger, payout
            queue, and audit events.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EvaluateButton action={triggerEvaluate} />
          <SyncTreasuryHistoryButton />
        </div>
      </div>

      {onChainResult.ok ? (
        <TreasuryOnChainSection report={onChainResult.data} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>{onChainResult.error.msg}</AlertDescription>
        </Alert>
      )}

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Internal ledger
          </h2>
          <p className="text-sm text-muted-foreground">
            Stored bookkeeping updated only by app events (subscribe, payout,
            withdrawal). Not the Tron wallet balance — external treasury
            deposits are excluded.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pool available</CardDescription>
            <CardTitle>{formatUsdtDisplay(ledger.poolAvailable)} USDT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
            {treasuryHints.poolAvailable.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Treasury surplus</CardDescription>
            <CardTitle>{formatUsdtDisplay(ledger.treasurySurplus)} USDT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
            {treasuryHints.treasurySurplus.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Withdrawable liquidity</CardDescription>
            <CardTitle>
              {formatUsdtDisplay(ledger.protectedRevenueAvailable)} USDT
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
            {treasuryHints.protectedRevenueAvailable.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p>
              Platform withdrawn (audit):{" "}
              {formatUsdtDisplay(ledger.protectedRevenueWithdrawn)} USDT
            </p>
          </CardContent>
        </Card>
        </div>
        <TreasuryLedgerIntegrityCard
          report={ledgerIntegrity}
          subscribeDiagnostics={subscribeDiagnostics}
        />
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Recorded app withdrawals</CardTitle>
            <CardDescription>
              Persisted rows that drive the Withdrawn total on the ledger card
              above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TreasuryRecordedWithdrawalsTable
              withdrawals={recordedWithdrawals}
              totalWithdrawn={ledger.protectedRevenueWithdrawn}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payout queue</CardTitle>
          <CardDescription>
            Investments unlocked by two later investments, scheduled for payout.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead>Payout</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Unlocked at</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    Queue empty.
                  </TableCell>
                </TableRow>
              ) : (
                queue.map((item) => (
                  <TableRow key={item.investmentId}>
                    <TableCell>{item.rank}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.userEmail}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.userName}
                      </div>
                    </TableCell>
                    <TableCell>{item.fundId}</TableCell>
                    <TableCell>
                      {formatUsdtDisplay(item.projectedPayoutUsdt)} USDT
                    </TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{formatDate(item.payoutUnlockedAt)}</TableCell>
                    <TableCell>{item.payoutReason ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Treasury events</CardTitle>
          <CardDescription>
            subscribe_inflow, payout_outflow, surplus_credit/draw, app_withdrawal
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Pool after</TableHead>
                <TableHead>Surplus after</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No events yet.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((ev) => (
                  <TableRow key={ev._id}>
                    <TableCell>{formatDate(ev.createdAt)}</TableCell>
                    <TableCell>{ev.type}</TableCell>
                    <TableCell>{formatUsdtDisplay(ev.amountUsdt)} USDT</TableCell>
                    <TableCell>
                      {formatUsdtDisplayOrDash(ev.poolAfter)}
                    </TableCell>
                    <TableCell>
                      {formatUsdtDisplayOrDash(ev.surplusAfter)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
