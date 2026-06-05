import type { SerializedTreasuryOnChainReport } from "@/lib/serializers/treasuryAdmin";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TreasuryActivityPanel } from "./TreasuryActivityPanel";
import { TreasuryOnChainDebug } from "./TreasuryOnChainDebug";

type Props = {
  report: SerializedTreasuryOnChainReport;
};

const SUMMARY_ROWS: Array<{
  key: keyof SerializedTreasuryOnChainReport["chainSummary"]["byCategory"];
  label: string;
}> = [
  { key: "user_payment", label: "User payment (confirmed)" },
  { key: "user_payout", label: "User payout (confirmed)" },
  { key: "external_in", label: "External deposit" },
  { key: "app_withdrawal", label: "App withdrawal (ledger-linked)" },
  {
    key: "treasury_outflow_untracked",
    label: "Treasury outflow (untracked)",
  },
  { key: "wallet_match_unconfirmed", label: "Wallet match only" },
];

export function TreasuryOnChainSection({ report }: Props) {
  const {
    balances,
    chainSummary,
    withdrawalSync,
    trxAlert,
    chainHistoryError,
    transactions,
  } = report;

  return (
    <div className="space-y-6">
      <TreasuryOnChainDebug report={report} />

      <div>
        <h2 className="text-lg font-semibold tracking-tight">On-chain treasury</h2>
        <p className="text-sm text-muted-foreground">
          Wallet balances and USDT history from TronGrid. Internal ledger cards
          below are accounting for pool and payout math — they are not expected
          to equal the Tron wallet balance.
        </p>
      </div>

      {!balances.address ? (
        <Alert variant="destructive">
          <AlertTitle>Treasury address not configured</AlertTitle>
          <AlertDescription>
            Set TREASURY_ADDRESS in the backend environment to load on-chain
            data.
          </AlertDescription>
        </Alert>
      ) : null}

      {trxAlert ? (
        <Alert variant="destructive">
          <AlertTitle>Low TRX fuel</AlertTitle>
          <AlertDescription>{trxAlert.message}</AlertDescription>
        </Alert>
      ) : null}

      {chainHistoryError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load transaction history</AlertTitle>
          <AlertDescription>
            Balances may still be accurate. Check TronGrid connectivity and
            TRON_API_KEY rate limits, then refresh.
          </AlertDescription>
        </Alert>
      ) : null}

      {chainSummary.byCategory.treasury_outflow_untracked.count > 0 ? (
        <Alert>
          <AlertTitle>Untracked treasury outflows</AlertTitle>
          <AlertDescription>
            {chainSummary.byCategory.treasury_outflow_untracked.count} outbound
            transfer
            {chainSummary.byCategory.treasury_outflow_untracked.count === 1
              ? ""
              : "s"}{" "}
            (
            {formatUsdtDisplay(
              chainSummary.byCategory.treasury_outflow_untracked.totalUsdt
            )}{" "}
            USDT) are not synced to the internal ledger — typically pre-app
            history, external payouts, or transfers without an app withdrawal
            record.
          </AlertDescription>
        </Alert>
      ) : null}

      {withdrawalSync.failed.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Ledger-linked withdrawals could not sync</AlertTitle>
          <AlertDescription>
            These outflows match an app withdrawal tx ref but failed ledger
            rules (slots or liquidity):
            <ul className="mt-2 list-inside list-disc text-sm">
              {withdrawalSync.failed.map((item) => (
                <li key={item.txId}>
                  <span className="font-mono text-xs">{item.txId.slice(0, 12)}…</span>
                  : {item.error}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>USDT on wallet</CardDescription>
            <CardTitle>{formatUsdtDisplay(balances.usdt, 4)} USDT</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            On-chain TRC-20 balance
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>TRX on wallet (fuel)</CardDescription>
            <CardTitle>{balances.trx} TRX</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Used for fees and sponsorship
          </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardDescription>Treasury address</CardDescription>
            <CardTitle className="break-all font-mono text-sm font-normal">
              {balances.address || "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Network: {balances.network}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">On-chain activity summary</CardTitle>
          <CardDescription>
            Classified USDT transfers for this wallet. User payment and payout
            require a matching app transaction ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {SUMMARY_ROWS.map(({ key, label }) => {
              const bucket = chainSummary.byCategory[key];
              return (
                <div key={key}>
                  <span className="text-muted-foreground">{label}</span>
                  <p className="font-medium">
                    {bucket.count} tx · {formatUsdtDisplay(bucket.totalUsdt)} USDT
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <TreasuryActivityPanel transactions={transactions} />
    </div>
  );
}
