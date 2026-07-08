"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import type { AdminWalletAggregates } from "@/services/admin/dashboardWalletStats";

type DashboardWalletStatsPanelProps = {
  aggregates: AdminWalletAggregates | null;
  isLoading: boolean;
};

function WalletStatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>
      ) : null}
    </Card>
  );
}

export function DashboardWalletStatsPanel({
  aggregates,
  isLoading,
}: DashboardWalletStatsPanelProps) {
  if (isLoading || !aggregates) {
    return (
      <>
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </>
    );
  }

  return (
    <>
      <WalletStatCard
        title="Users with funded wallets"
        value={aggregates.usersWithFundedWallet}
        hint="From synced wallet activity in the database"
      />
      <WalletStatCard
        title="USDT on user wallets"
        value={`${formatUsdtDisplay(aggregates.totalUsdtOnUserWallets, 4)} USDT`}
        hint="Cached on-chain balances (pending inbound excluded)"
      />
    </>
  );
}
