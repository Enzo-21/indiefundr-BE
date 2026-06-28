"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, TriangleAlert } from "lucide-react";
import { adminGetReferralPayoutEstimate } from "@/actions/admin/referralPayoutOrders";
import { AdminWorkflowStepCard } from "@/app/admin/_components/AdminWorkflowStepCard";
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
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { cn } from "@/lib/utils";
import type {
  AdminReferralPayoutRow,
  ReferralPayoutFulfillmentEstimate,
} from "@/services/admin/referralPayoutOrderFulfillment";
import {
  type CompleteReferralPayoutStepId,
  useCompleteReferralPayoutWorkflow,
} from "./useCompleteReferralPayoutWorkflow";

const STEP_ORDER: CompleteReferralPayoutStepId[] = [
  "broadcast",
  "confirm",
  "complete",
];

export function CompleteReferralPayoutDialog({
  row,
}: {
  row: AdminReferralPayoutRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [estimate, setEstimate] =
    useState<ReferralPayoutFulfillmentEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const {
    steps,
    running,
    error,
    manualSkipCount,
    run,
    cancel,
    resetSteps,
    applySeedFromOrder,
    toggleManualStep,
  } = useCompleteReferralPayoutWorkflow(row.orderId, row.costUsdt, {
    usdtTxId: row.usdtTxId,
    usdtTronscanUrl: row.usdtTronscanUrl,
  });

  const canComplete = Boolean(row.walletAddress);

  const disabledReason = !row.walletAddress
    ? "Wallet address missing"
    : undefined;

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      applySeedFromOrder();
      setEstimateLoading(true);
      setEstimateError(null);
      void adminGetReferralPayoutEstimate(row.orderId).then((result) => {
        setEstimateLoading(false);
        if (result.ok) {
          setEstimate(result.data);
        } else {
          setEstimate(null);
          setEstimateError(result.error.msg);
        }
      });
      return;
    }
    if (wasOpenRef.current) {
      cancel();
      resetSteps();
      setEstimate(null);
      setEstimateError(null);
      wasOpenRef.current = false;
    }
  }, [open, cancel, resetSteps, applySeedFromOrder, row.orderId]);

  const handleOpenChange = (next: boolean) => {
    if (running && !next) {
      return;
    }
    setOpen(next);
  };

  const handleToggleManualSkip = (stepId: CompleteReferralPayoutStepId) => {
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
      toast.success("Referral payout completed");
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        disabled={!canComplete}
        title={disabledReason}
        className={cn(
          buttonVariants({ variant: "default", size: "sm" }),
          !canComplete && "pointer-events-none opacity-50"
        )}
      >
        Complete referral payout
      </DialogTrigger>
      <DialogContent
        showCloseButton={!running}
        className="gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl"
      >
        <div className="space-y-5 p-6 pb-4">
          <DialogHeader className="gap-3 text-left">
            <DialogTitle className="text-xl">Complete referral payout</DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              Automate USDT payment from treasury, on-chain confirmation, and
              ledger settlement for this referral bonus.
            </DialogDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                {row.userEmail}
              </span>
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                {row.kindLabel}
              </span>
              <span
                className="max-w-full truncate rounded-md bg-muted px-2.5 py-1 font-mono text-xs font-medium text-foreground"
                title={row.walletAddress}
              >
                {row.walletAddress}
              </span>
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {formatUsdtDisplay(row.costUsdt)} USDT
              </span>
            </div>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm">
            <p className="mb-2 font-medium text-foreground">Treasury preflight</p>
            {estimateLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Checking treasury balances…</span>
              </div>
            ) : estimateError ? (
              <p className="text-destructive">{estimateError}</p>
            ) : estimate ? (
              <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
                <span>
                  Treasury USDT:{" "}
                  <span className="font-medium text-foreground">
                    {formatUsdtDisplay(estimate.treasuryUsdtBalance)}
                  </span>
                </span>
                <span>
                  Treasury TRX:{" "}
                  <span className="font-medium text-foreground">
                    {estimate.treasuryTrxBalance.toFixed(4)}
                  </span>
                  {estimate.estimatedTrx > 0
                    ? ` (~${estimate.estimatedTrx.toFixed(4)} fee)`
                    : null}
                </span>
                <span>
                  Ledger surplus:{" "}
                  <span className="font-medium text-foreground">
                    {formatUsdtDisplay(estimate.ledgerTreasurySurplus)}
                  </span>
                </span>
                <span>
                  Ready:{" "}
                  <span
                    className={
                      estimate.canTransfer
                        ? "font-medium text-emerald-600 dark:text-emerald-400"
                        : "font-medium text-destructive"
                    }
                  >
                    {estimate.canTransfer ? "Yes" : "No — fix treasury first"}
                  </span>
                </span>
              </div>
            ) : (
              <p className="text-muted-foreground">Estimate unavailable.</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-foreground">
              Automation progress
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              Click a step to mark it as already done. Marked steps are skipped
              when automation runs.
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
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
                    onToggleManualSkip={(id) =>
                      handleToggleManualSkip(id as CompleteReferralPayoutStepId)
                    }
                  />
                );
              })}
            </div>
          </div>

          {running ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span>Running referral payout automation…</span>
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
              Retry
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
