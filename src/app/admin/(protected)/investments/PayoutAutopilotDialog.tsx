"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { AutopilotBatchSummaryPanel } from "@/app/admin/_components/AutopilotBatchSummaryPanel";
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
import {
  buildAutopilotCompleteToastMessage,
  buildAutopilotStopToastMessage,
} from "@/lib/admin/autopilotBatch";
import { cn } from "@/lib/utils";
import { PayoutAutopilotBatchRunner } from "./PayoutAutopilotBatchRunner";
import { PayoutAutopilotCountdownPanel } from "./PayoutAutopilotCountdownPanel";
import {
  type AutopilotPayoutCandidate,
  usePayoutAutopilot,
} from "./usePayoutAutopilot";

function ModeCard({
  title,
  description,
  count,
  selected,
  onToggle,
}: {
  title: string;
  description: string;
  count: number;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex min-h-[140px] flex-1 flex-col rounded-xl border p-4 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border/80 bg-muted/20 hover:bg-muted/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {selected ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span className="h-6 w-6 rounded-full border border-muted-foreground/30" />
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <p className="mt-auto pt-4 text-lg font-semibold tabular-nums">
        {count} {count === 1 ? "investment" : "investments"}
      </p>
    </button>
  );
}

type AdvanceOutcome = {
  done: boolean;
  completedCount: number;
  manualCheckItems: { key: string; label: string; detail: string; error: string }[];
  nextCandidate?: AutopilotPayoutCandidate;
};

export function PayoutAutopilotDialog({
  unlockedPayoutCount,
  surplusPayoutCount,
}: {
  unlockedPayoutCount: number;
  surplusPayoutCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const cancelActiveWorkflowRef = useRef<(() => void) | null>(null);

  const registerActiveWorkflowCancel = useCallback(
    (cancelActiveWorkflow: (() => void) | null) => {
      cancelActiveWorkflowRef.current = cancelActiveWorkflow;
    },
    []
  );
  const {
    phase,
    includeNormal,
    includeSurplus,
    setIncludeNormal,
    setIncludeSurplus,
    initialTotal,
    completedCount,
    manualCheckItems,
    currentCandidate,
    pendingCandidate,
    countdownSecondsLeft,
    configureError,
    startBatch,
    advanceAfterSuccess,
    advanceAfterFailure,
    beginCountdown,
    stopAutopilot,
    resetToConfigure,
  } = usePayoutAutopilot();

  const selectedNormalCount = includeNormal ? unlockedPayoutCount : 0;
  const selectedSurplusCount = includeSurplus ? surplusPayoutCount : 0;
  const selectedTotal = selectedNormalCount + selectedSurplusCount;
  const canStart = selectedTotal > 0 && (includeNormal || includeSurplus);
  const processedCount = completedCount + manualCheckItems.length;
  const currentItemIndex = processedCount + 1;
  const nextItemIndex = processedCount + 1;

  const summaryText = useMemo(() => {
    const parts: string[] = [];
    if (includeNormal && unlockedPayoutCount > 0) {
      parts.push(
        `${unlockedPayoutCount} normal payout${unlockedPayoutCount === 1 ? "" : "s"}`
      );
    }
    if (includeSurplus && surplusPayoutCount > 0) {
      parts.push(
        `${surplusPayoutCount} surplus payout${surplusPayoutCount === 1 ? "" : "s"}`
      );
    }
    if (parts.length === 0) {
      return "Select at least one payout mode with eligible investments.";
    }
    const base = `Will run up to ${parts.join(" and ")} (${selectedTotal} total). Normal payouts run first, then surplus FIFO. Items that fail after retries are skipped and flagged for manual check; autopilot continues with the rest.`;
    if (selectedTotal > 1) {
      return `${base} There is a 10 second pause between each payout.`;
    }
    return base;
  }, [
    includeNormal,
    includeSurplus,
    selectedTotal,
    surplusPayoutCount,
    unlockedPayoutCount,
  ]);

  const showBatchCompleteToast = (outcome: AdvanceOutcome) => {
    const message = buildAutopilotCompleteToastMessage({
      itemLabel: "payout",
      completedCount: outcome.completedCount,
      manualCheckCount: outcome.manualCheckItems.length,
    });
    if (outcome.manualCheckItems.length > 0) {
      toast.warning(message);
    } else {
      toast.success(message);
    }
  };

  const handleAdvanceOutcome = async (outcome: AdvanceOutcome) => {
    if (outcome.done) {
      showBatchCompleteToast(outcome);
      return;
    }
    if (outcome.nextCandidate) {
      beginCountdown(outcome.nextCandidate);
    }
  };

  const handleStopAutopilot = () => {
    cancelActiveWorkflowRef.current?.();
    const { completedCount: stoppedCompleted, manualCheckCount } = stopAutopilot();
    setOpen(false);
    router.refresh();
    toast.message(
      buildAutopilotStopToastMessage({
        itemLabel: "payout",
        completedCount: stoppedCompleted,
        manualCheckCount,
      })
    );
  };

  const handleSummaryClose = () => {
    resetToConfigure();
    setOpen(false);
    router.refresh();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (phase === "running") {
        return;
      }
      if (phase === "countdown") {
        handleStopAutopilot();
        return;
      }
      if (phase === "summary") {
        handleSummaryClose();
        return;
      }
      resetToConfigure();
    }
    setOpen(next);
  };

  const handleStart = async () => {
    setStarting(true);
    const result = await startBatch();
    setStarting(false);
    if (!result.ok) {
      toast.error(result.error);
    }
  };

  const handlePayoutSuccess = async () => {
    try {
      const outcome = await advanceAfterSuccess();
      await handleAdvanceOutcome(outcome);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  };

  const handlePayoutFailure = async ({ error }: { error: string }) => {
    toast.warning(`Skipping payout — manual check needed`);
    try {
      const outcome = await advanceAfterFailure(error);
      if (!outcome) {
        return;
      }
      await handleAdvanceOutcome(outcome);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  };

  const handleCancelAutopilot = () => {
    cancelActiveWorkflowRef.current?.();
    const { completedCount: stoppedCompleted, manualCheckCount } = stopAutopilot();
    setOpen(false);
    router.refresh();
    toast.message(
      buildAutopilotStopToastMessage({
        itemLabel: "payout",
        completedCount: stoppedCompleted,
        manualCheckCount,
      })
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      disablePointerDismissal={phase === "running"}
    >
      <DialogTrigger className={buttonVariants({ variant: "default", size: "sm" })}>
        Autopilot
      </DialogTrigger>
      <DialogContent
        showCloseButton={phase === "configure" || phase === "summary"}
        className="gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl"
      >
        {phase === "configure" ? (
          <>
            <div className="space-y-5 p-6 pb-4">
              <DialogHeader className="gap-3 text-left">
                <DialogTitle className="text-xl">Payout autopilot</DialogTitle>
                <DialogDescription className="text-base leading-relaxed">
                  Choose which payout modes to run automatically. Each eligible
                  investment uses the same four-step workflow as Pay now and Pay
                  with surplus.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <ModeCard
                  title="Normal payouts"
                  description="Unlocked investments ready for Pay now (two-user unlock)."
                  count={unlockedPayoutCount}
                  selected={includeNormal}
                  onToggle={() => setIncludeNormal((value) => !value)}
                />
                <ModeCard
                  title="Surplus payouts"
                  description="FIFO-eligible investments when surplus covers the payout."
                  count={surplusPayoutCount}
                  selected={includeSurplus}
                  onToggle={() => setIncludeSurplus((value) => !value)}
                />
              </div>

              <p className="text-sm text-muted-foreground">{summaryText}</p>

              {configureError ? (
                <p className="text-sm text-destructive">{configureError}</p>
              ) : null}
            </div>

            <DialogFooter className="mx-0 mb-0 border-t bg-muted/30 px-6 py-4 sm:justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button
                disabled={!canStart || starting}
                onClick={() => {
                  void handleStart();
                }}
              >
                {starting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting…
                  </>
                ) : (
                  "Start autopilot"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : phase === "countdown" && pendingCandidate ? (
          <PayoutAutopilotCountdownPanel
            completedCount={processedCount}
            initialTotal={initialTotal}
            nextIndex={nextItemIndex}
            countdownSecondsLeft={countdownSecondsLeft}
            pendingCandidate={pendingCandidate}
            onStop={handleStopAutopilot}
          />
        ) : phase === "summary" ? (
          <AutopilotBatchSummaryPanel
            title="Payout autopilot finished"
            itemLabel="payout"
            completedCount={completedCount}
            manualCheckItems={manualCheckItems}
            onClose={handleSummaryClose}
          />
        ) : currentCandidate ? (
          <PayoutAutopilotBatchRunner
            key={`${currentCandidate.investmentId}:${currentCandidate.mode}`}
            candidate={currentCandidate}
            payoutIndex={currentItemIndex}
            initialTotal={initialTotal}
            onSuccess={handlePayoutSuccess}
            onFailure={handlePayoutFailure}
            onCancel={handleCancelAutopilot}
            onRegisterCancel={registerActiveWorkflowCancel}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
