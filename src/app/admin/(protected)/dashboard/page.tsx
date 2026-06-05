import Link from "next/link";
import {
  fetchAdminOverview,
  fetchFundedUsers,
  fetchTronLimiterDiagnostics,
} from "@/actions/admin/dashboard";
import { triggerEvaluate } from "@/actions/treasury";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { buildTreasuryLedgerHints } from "@/services/revenueEngine/ledgerDisplay";
import { EvaluateButton } from "./EvaluateButton";

export const dynamic = "force-dynamic";

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string | string[];
}) {
  const hints = hint == null ? [] : Array.isArray(hint) ? hint : [hint];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hints.length > 0 ? (
        <CardContent className="space-y-1 pt-0 text-xs text-muted-foreground">
          {hints.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(d);
}

function formatUsdt(value: number) {
  return formatUsdtDisplay(value, 4);
}

type AdminActionError = {
  code: string;
  msg: string;
};

function isTronRateLimit(error: AdminActionError) {
  return error.code === "TRON_RATE_LIMIT";
}

function adminErrorTitle(error: AdminActionError, fallback: string) {
  return isTronRateLimit(error) ? "Tron provider rate limit" : fallback;
}

function adminErrorDescription(error: AdminActionError) {
  if (isTronRateLimit(error)) {
    return `${error.msg} This dashboard reads live on-chain wallet data, so it can be temporarily blocked when cron jobs or other admin pages are also scanning TronGrid.`;
  }
  return error.msg;
}

export default async function AdminDashboardPage() {
  const [overviewResult, fundedResult, diagnosticsResult] = await Promise.all([
    fetchAdminOverview(),
    fetchFundedUsers(15),
    fetchTronLimiterDiagnostics(),
  ]);

  if (!overviewResult.ok) {
    return (
      <Alert variant="destructive">
        <AlertTitle>
          {adminErrorTitle(overviewResult.error, "Dashboard unavailable")}
        </AlertTitle>
        <AlertDescription>
          {adminErrorDescription(overviewResult.error)}
        </AlertDescription>
      </Alert>
    );
  }

  const s = overviewResult.data;
  const t = s.treasury;
  const treasuryHints = buildTreasuryLedgerHints(t);
  const fundedUsers = fundedResult.ok ? fundedResult.data : [];
  const fundedUsersError = fundedResult.ok ? null : fundedResult.error;
  const limiter = diagnosticsResult.ok ? diagnosticsResult.data.tronLimiter : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of users, investments, and treasury.
          </p>
        </div>
        <EvaluateButton action={triggerEvaluate} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total users" value={s.totalUsers} />
        <StatCard
          title="Users with funded wallets"
          value={s.usersWithFundedWallet}
        />
        <StatCard
          title="USDT on user wallets"
          value={`${formatUsdtDisplay(s.totalUsdtOnUserWallets, 4)} USDT`}
        />
        <StatCard title="Users invested" value={s.usersWithInvestment} />
        <StatCard
          title="Investments paid (redeemed)"
          value={s.investmentsPaid}
        />
        <StatCard title="Pending orders" value={s.pendingOrders} />
        <StatCard title="Active investments" value={s.activeInvestments} />
        <StatCard title="Matured" value={s.maturedInvestments} />
        <StatCard title="Redeeming" value={s.redeemingInvestments} />
        <StatCard
          title="Pool available"
          value={`${formatUsdtDisplay(t.poolAvailable)} USDT`}
          hint={treasuryHints.poolAvailable}
        />
        <StatCard
          title="Treasury surplus"
          value={`${formatUsdtDisplay(t.treasurySurplus)} USDT`}
          hint={treasuryHints.treasurySurplus}
        />
        <StatCard
          title="Withdrawable liquidity"
          value={`${formatUsdtDisplay(t.protectedRevenueAvailable)} USDT`}
          hint={[
            ...treasuryHints.protectedRevenueAvailable,
            `Platform withdrawn (audit): ${formatUsdtDisplay(t.protectedRevenueWithdrawn)} USDT`,
          ]}
        />
        {limiter ? (
          <StatCard
            title="Tron limiter"
            value={`${limiter.config.rpsLimit} req/s`}
            hint={[
              `queued: ${limiter.stats.queuedRequests} · inFlight: ${limiter.stats.inFlightRequests}`,
              `retries: ${limiter.stats.retryCount} · 429s: ${limiter.stats.rateLimit429Count}`,
              `cache hit/miss: ${limiter.stats.cacheHits}/${limiter.stats.cacheMisses}`,
              `requests ok/fail: ${limiter.stats.successfulResponses}/${limiter.stats.failedResponses}`,
              `total requests: ${limiter.stats.totalRequests}`,
            ]}
          />
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Recently funded users</h2>
            <p className="text-sm text-muted-foreground">
              On-chain deposits and balances (invest/redemption excluded).
            </p>
          </div>
          <Link
            href="/admin/users"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            All users
          </Link>
        </div>
        {fundedUsersError ? (
          <Alert variant="destructive">
            <AlertTitle>
              {adminErrorTitle(
                fundedUsersError,
                "Could not load recently funded users"
              )}
            </AlertTitle>
            <AlertDescription>
              {isTronRateLimit(fundedUsersError)
                ? "The funded-users table needs live Tron wallet history and balances. TronGrid is rate limiting those reads right now, so wait a minute and refresh."
                : fundedUsersError.msg}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Deposited</TableHead>
                <TableHead className="text-right">Withdrawn</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fundedUsers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground"
                  >
                    {fundedUsersError
                      ? "Recently funded users could not load."
                      : "No funded wallets yet."}
                  </TableCell>
                </TableRow>
              ) : (
                fundedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell className="text-right">
                      {formatUsdt(user.currentBalance)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatUsdt(user.totalDeposited)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatUsdt(user.totalWithdrawn)}
                    </TableCell>
                    <TableCell>{formatDate(user.joinedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/users"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          View users
        </Link>
        <Link
          href="/admin/investments"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          View investments
        </Link>
        <Link
          href="/admin/treasury"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Treasury
        </Link>
      </div>
    </div>
  );
}
