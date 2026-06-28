"use client";

import { OrderAutopilotDialog } from "./OrderAutopilotDialog";
import { SubscriptionsRefreshButton } from "./SubscriptionsRefreshButton";

export function SubscriptionsOrderStatusBar({
  pendingInvestmentCount,
  pendingWithdrawalCount,
  pendingReferralCount = 0,
}: {
  pendingInvestmentCount: number;
  pendingWithdrawalCount: number;
  pendingReferralCount?: number;
}) {
  const pendingOrderCount =
    pendingInvestmentCount + pendingWithdrawalCount + pendingReferralCount;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3 text-sm">
      <div>
        <span className="text-muted-foreground">Pending orders </span>
        <span className="font-medium">
          {pendingOrderCount}{" "}
          {pendingOrderCount === 1 ? "order" : "orders"}
        </span>
        {pendingInvestmentCount > 0 ||
        pendingWithdrawalCount > 0 ||
        pendingReferralCount > 0 ? (
          <span className="text-muted-foreground">
            {" "}
            ({[
              pendingInvestmentCount > 0
                ? `${pendingInvestmentCount} investment`
                : null,
              pendingWithdrawalCount > 0
                ? `${pendingWithdrawalCount} withdrawal`
                : null,
              pendingReferralCount > 0
                ? `${pendingReferralCount} referral`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            )
          </span>
        ) : null}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SubscriptionsRefreshButton />
        <OrderAutopilotDialog
          pendingInvestmentCount={pendingInvestmentCount}
          pendingWithdrawalCount={pendingWithdrawalCount}
          pendingReferralCount={pendingReferralCount}
        />
      </div>
    </div>
  );
}
