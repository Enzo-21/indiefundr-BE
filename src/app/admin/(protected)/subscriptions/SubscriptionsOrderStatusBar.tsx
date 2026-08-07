"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildAutopilotStopToastMessage } from "@/lib/admin/autopilotBatch";
import { OrderAutopilotDialog } from "./OrderAutopilotDialog";
import { SubscriptionsRefreshButton } from "./SubscriptionsRefreshButton";
import { useOrderAutopilot } from "./useOrderAutopilot";

export function SubscriptionsOrderStatusBar({
  pendingInvestmentCount,
  pendingWithdrawalCount,
  pendingReferralCount = 0,
  pendingUsdtPurchaseCount = 0,
}: {
  pendingInvestmentCount: number;
  pendingWithdrawalCount: number;
  pendingReferralCount?: number;
  pendingUsdtPurchaseCount?: number;
}) {
  const router = useRouter();
  const autopilot = useOrderAutopilot();
  const pendingOrderCount =
    pendingInvestmentCount +
    pendingWithdrawalCount +
    pendingReferralCount +
    pendingUsdtPurchaseCount;

  const handleStopContinuous = () => {
    const { completedCount, manualCheckCount } = autopilot.stopContinuous();
    router.refresh();
    toast.message(
      buildAutopilotStopToastMessage({
        itemLabel: "order",
        completedCount,
        manualCheckCount,
      })
    );
  };

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
        pendingReferralCount > 0 ||
        pendingUsdtPurchaseCount > 0 ? (
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
              pendingUsdtPurchaseCount > 0
                ? `${pendingUsdtPurchaseCount} USDT purchase`
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
        {autopilot.continuousEnabled ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStopContinuous}
          >
            Stop Autopilot
          </Button>
        ) : null}
        <OrderAutopilotDialog
          pendingInvestmentCount={pendingInvestmentCount}
          pendingWithdrawalCount={pendingWithdrawalCount}
          pendingReferralCount={pendingReferralCount}
          pendingUsdtPurchaseCount={pendingUsdtPurchaseCount}
          autopilot={autopilot}
          hideTrigger={autopilot.continuousEnabled}
        />
      </div>
    </div>
  );
}
