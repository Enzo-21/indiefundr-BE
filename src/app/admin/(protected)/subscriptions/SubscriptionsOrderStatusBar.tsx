"use client";

import { OrderAutopilotDialog } from "./OrderAutopilotDialog";
import { SubscriptionsRefreshButton } from "./SubscriptionsRefreshButton";

export function SubscriptionsOrderStatusBar({
  pendingInvestmentCount,
  pendingWithdrawalCount,
}: {
  pendingInvestmentCount: number;
  pendingWithdrawalCount: number;
}) {
  const pendingOrderCount = pendingInvestmentCount + pendingWithdrawalCount;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3 text-sm">
      <div>
        <span className="text-muted-foreground">Pending orders </span>
        <span className="font-medium">
          {pendingOrderCount}{" "}
          {pendingOrderCount === 1 ? "order" : "orders"}
        </span>
        {pendingInvestmentCount > 0 && pendingWithdrawalCount > 0 ? (
          <span className="text-muted-foreground">
            {" "}
            ({pendingInvestmentCount} investment · {pendingWithdrawalCount}{" "}
            withdrawal)
          </span>
        ) : null}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SubscriptionsRefreshButton />
        <OrderAutopilotDialog
          pendingInvestmentCount={pendingInvestmentCount}
          pendingWithdrawalCount={pendingWithdrawalCount}
        />
      </div>
    </div>
  );
}
