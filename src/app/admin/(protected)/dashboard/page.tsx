import Link from "next/link";
import { fetchAdminOverviewFast } from "@/actions/admin/dashboard";
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
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { buildTreasuryLedgerHints } from "@/services/revenueEngine/ledgerDisplay";
import { EvaluateButton } from "./EvaluateButton";
import { DashboardWalletSection } from "./DashboardWalletSection";
import {
  adminErrorDescription,
  adminErrorTitle,
} from "./dashboardAdminErrors";

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

export default async function AdminDashboardPage() {
  const overviewResult = await fetchAdminOverviewFast();

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
      </div>

      <DashboardWalletSection />

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
