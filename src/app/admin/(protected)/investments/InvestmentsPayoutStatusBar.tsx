"use client";

import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { PayoutAutopilotDialog } from "./PayoutAutopilotDialog";

export function InvestmentsPayoutStatusBar({
  currentLedger,
  payoutAvailability,
}: {
  currentLedger: {
    poolAvailable: number;
    treasurySurplus: number;
    protectedRevenueAvailable: number;
  };
  payoutAvailability: {
    unlockedPayoutCount: number;
    surplusPayoutCount: number;
  };
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3 text-sm">
      <div>
        <span className="text-muted-foreground">Current pool </span>
        <span className="font-medium">
          {formatUsdtDisplay(currentLedger.poolAvailable)} USDT
        </span>
      </div>
      <div title="Shared across optional Pay with surplus actions; refreshes after each surplus payout">
        <span className="text-muted-foreground">Current surplus </span>
        <span className="font-medium">
          {formatUsdtDisplay(currentLedger.treasurySurplus)} USDT
        </span>
      </div>
      <div>
        <span className="text-muted-foreground">Withdrawable liquidity </span>
        <span className="font-medium">
          {formatUsdtDisplay(currentLedger.protectedRevenueAvailable)} USDT
        </span>
      </div>
      <div title="Investments with two-user unlock ready for Pay now">
        <span className="text-muted-foreground">Unlocked payouts </span>
        <span className="font-medium">
          {payoutAvailability.unlockedPayoutCount}{" "}
          {payoutAvailability.unlockedPayoutCount === 1
            ? "investment"
            : "investments"}
        </span>
      </div>
      <div title="Investments eligible for Pay with surplus in FIFO order">
        <span className="text-muted-foreground">Surplus payouts </span>
        <span className="font-medium">
          {payoutAvailability.surplusPayoutCount}{" "}
          {payoutAvailability.surplusPayoutCount === 1
            ? "investment"
            : "investments"}
        </span>
      </div>
      <div className="ml-auto">
        <PayoutAutopilotDialog
          unlockedPayoutCount={payoutAvailability.unlockedPayoutCount}
          surplusPayoutCount={payoutAvailability.surplusPayoutCount}
        />
      </div>
    </div>
  );
}
