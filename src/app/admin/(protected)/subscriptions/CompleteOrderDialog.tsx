"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, TriangleAlert } from "lucide-react";
import { AdminWorkflowStepCard } from "@/app/admin/_components/AdminWorkflowStepCard";
import { LiveCountdown } from "@/app/admin/_components/LiveCountdown";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { adminGetSiblingOpenOrdersForRecovery } from "@/actions/admin/purchaseOrders";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { isAdminWorkflowDismissBlocked } from "@/lib/admin/workflowStepUi";
import { cn } from "@/lib/utils";
import type { AdminSubscriptionRow } from "@/services/admin/purchaseOrderFulfillment";
import type { SiblingOpenOrderCounts } from "@/services/admin/siblingOpenOrders";
import {
  type CompleteOrderStepId,
  type CompleteOrderStepSnapshot,
  useCompleteOrderWorkflow,
} from "./useCompleteOrderWorkflow";

const STEP_ORDER: CompleteOrderStepSnapshot["id"][] = [
  "trx",
  "usdt",
  "recover",
  "complete",
];

function formatBalance(value: number | null, decimals = 2) {
  if (value == null) {
    return "—";
  }
  return formatUsdtDisplay(value, value < 1 ? 4 : decimals);
}

function formatOrderStep(step: string): string {
  return step
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSiblingBannerBreakdown(counts: SiblingOpenOrderCounts): string {
  const parts: string[] = [];
  if (counts.investmentOrders > 0) {
    parts.push(
      `${counts.investmentOrders} investment ${counts.investmentOrders === 1 ? "order" : "orders"}`
    );
  }
  if (counts.withdrawalOrders > 0) {
    parts.push(
      `${counts.withdrawalOrders} withdrawal ${counts.withdrawalOrders === 1 ? "order" : "orders"}`
    );
  }
  return parts.join(", ");
}

export function CompleteOrderDialog({ row }: { row: AdminSubscriptionRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [siblingOrders, setSiblingOrders] =
    useState<SiblingOpenOrderCounts | null>(null);
  const {
    steps,
    running,
    error,
    walletSnapshot,
    retryCountdownUntil,
    manualSkipCount,
    run,
    cancel,
    resetSteps,
    applySeedFromOrder,
    toggleManualStep,
  } = useCompleteOrderWorkflow(row.orderId, row.costUsdt, {
    topUpTxId: row.topUpTxId,
    topUpTronscanUrl: row.topUpTronscanUrl,
    usdtTxId: row.usdtTxId,
    usdtTronscanUrl: row.usdtTronscanUrl,
  });

  const displayTrxBalance = walletSnapshot?.trxBalance ?? row.trxBalance;
  const displayUsdtBalance = walletSnapshot?.usdtBalance ?? row.usdtBalance;
  const recoverStep = steps.find((step) => step.id === "recover");
  const recoverablePreview =
    walletSnapshot && walletSnapshot.sponsoredTrx > 0
      ? `${formatBalance(walletSnapshot.recoverableTrx, 4)} TRX recoverable`
      : null;

  const canComplete =
    row.balanceReadStatus === "ok" &&
    Boolean(row.walletAddress) &&
    row.usdtBalance != null &&
    row.usdtBalance >= row.costUsdt;

  const disabledReason =
    row.balanceReadStatus !== "ok"
      ? "Chain balances unavailable — refresh and try again"
      : !row.walletAddress
        ? "Wallet address missing"
        : row.usdtBalance == null || row.usdtBalance < row.costUsdt
          ? "Insufficient USDT in user wallet"
          : undefined;

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      applySeedFromOrder();
      setSiblingOrders(null);
      void adminGetSiblingOpenOrdersForRecovery(row.orderId).then((result) => {
        if (result.ok) {
          setSiblingOrders(result.data);
        }
      });
      return;
    }
    if (wasOpenRef.current) {
      cancel();
      resetSteps();
      setSiblingOrders(null);
      wasOpenRef.current = false;
    }
  }, [open, cancel, resetSteps, applySeedFromOrder, row.orderId]);

  const handleOpenChange = (next: boolean) => {
    if (
      !next &&
      isAdminWorkflowDismissBlocked({
        running,
        retryCountdownUntil,
        steps,
      })
    ) {
      return;
    }
    setOpen(next);
  };

  const blockDismiss = isAdminWorkflowDismissBlocked({
    running,
    retryCountdownUntil,
    steps,
  });

  const handleToggleManualSkip = (stepId: CompleteOrderStepId) => {
    const warnings = toggleManualStep(stepId);
    for (const warning of warnings) {
      toast.warning(warning);
    }
  };

  const handleStart = async () => {
    const result = await run();
    if (result.success && result.allManual) {
      toast.success("All steps marked complete — nothing to run");
      setOpen(false);
      router.refresh();
      return;
    }
    if (result.success) {
      toast.success("Order completed");
      setOpen(false);
      router.refresh();
    } else if (error) {
      toast.error(error);
    }
  };

  const startButtonLabel = running
    ? "Processing…"
    : manualSkipCount > 0
      ? `Start automation (${manualSkipCount} step${manualSkipCount === 1 ? "" : "s"} skipped)`
      : "Start automation";

  const stepsById = Object.fromEntries(steps.map((step) => [step.id, step]));

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      disablePointerDismissal={blockDismiss}
    >
      <DialogTrigger
        disabled={!canComplete}
        title={disabledReason}
        className={cn(
          buttonVariants({ variant: "default", size: "sm" }),
          !canComplete && "pointer-events-none opacity-50"
        )}
      >
        Complete order
      </DialogTrigger>
      <DialogContent
        showCloseButton={!running}
        className="gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl"
      >
        <div className="space-y-5 p-6 pb-4">
          <DialogHeader className="gap-3 text-left">
            <DialogTitle className="text-xl">Complete order</DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              Automate TRX top-up, USDT payment, and mark-success for this
              subscription.
            </DialogDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                {row.userEmail}
              </span>
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                {row.fundName}
              </span>
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {formatUsdtDisplay(row.costUsdt)} USDT
              </span>
            </div>
          </DialogHeader>

          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Wallet TRX
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatBalance(displayTrxBalance, 4)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Wallet USDT
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatBalance(displayUsdtBalance)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Order amount
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatUsdtDisplay(row.costUsdt)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current step
              </p>
              <p className="text-lg font-semibold">{formatOrderStep(row.step)}</p>
            </div>
          </div>

          {recoverablePreview && recoverStep?.state !== "idle" ? (
            <p className="text-sm text-muted-foreground">{recoverablePreview}</p>
          ) : null}

          {siblingOrders && siblingOrders.total > 0 ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              <p className="font-semibold">Other open orders for this user</p>
              <p className="mt-1 leading-relaxed text-amber-800 dark:text-amber-200">
                This wallet has {siblingOrders.total} more open{" "}
                {siblingOrders.total === 1 ? "order" : "orders"} (
                {formatSiblingBannerBreakdown(siblingOrders)}). TRX recovery will
                be skipped after USDT so remaining sponsored TRX can fuel the
                next order.
              </p>
            </div>
          ) : null}

          <div>
            <p className="mb-1 text-sm font-medium text-foreground">
              Automation progress
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              Click a step to mark it as already done. Marked steps are skipped
              when automation runs.
            </p>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {STEP_ORDER.map((stepId, index) => {
                const step = stepsById[stepId];
                if (!step) {
                  return null;
                }
                return (
                  <AdminWorkflowStepCard
                    key={step.id}
                    step={step}
                    index={index}
                    running={running}
                    onToggleManualSkip={(stepId) =>
                      handleToggleManualSkip(stepId as CompleteOrderStepId)
                    }
                  />
                );
              })}
            </div>
          </div>

          {retryCountdownUntil ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span>Retrying after fuel failure —</span>
              <LiveCountdown target={retryCountdownUntil} />
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 border-t bg-muted/30 px-6 py-4 sm:justify-end">
          <Button
            variant="outline"
            disabled={running}
            onClick={() => setOpen(false)}
          >
            {running ? "Running…" : "Close"}
          </Button>
          {error && !running ? (
            <Button
              onClick={() => {
                void handleStart();
              }}
            >
              Retry from TRX
            </Button>
          ) : (
            <Button
              disabled={running || !canComplete}
              onClick={() => {
                void handleStart();
              }}
            >
              {startButtonLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
