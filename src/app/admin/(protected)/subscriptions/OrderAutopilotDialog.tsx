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
import { OrderAutopilotBatchRunner } from "./OrderAutopilotBatchRunner";
import { OrderAutopilotCountdownPanel } from "./OrderAutopilotCountdownPanel";
import {
  type AutopilotOrderCandidate,
  useOrderAutopilot,
} from "./useOrderAutopilot";

function ModeCard({
  title,
  description,
  count,
  countLabel,
  selected,
  onToggle,
}: {
  title: string;
  description: string;
  count: number;
  countLabel: string;
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
        {count} {countLabel}
      </p>
    </button>
  );
}

type AdvanceOutcome = {
  done: boolean;
  completedCount: number;
  manualCheckItems: { key: string; label: string; detail: string; error: string }[];
  nextCandidate?: AutopilotOrderCandidate;
};

export function OrderAutopilotDialog({
  pendingInvestmentCount,
  pendingWithdrawalCount,
  pendingReferralCount,
}: {
  pendingInvestmentCount: number;
  pendingWithdrawalCount: number;
  pendingReferralCount: number;
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
    includeInvestment,
    includeWithdrawal,
    includeReferral,
    setIncludeInvestment,
    setIncludeWithdrawal,
    setIncludeReferral,
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
  } = useOrderAutopilot();

  const selectedInvestmentCount = includeInvestment ? pendingInvestmentCount : 0;
  const selectedWithdrawalCount = includeWithdrawal ? pendingWithdrawalCount : 0;
  const selectedReferralCount = includeReferral ? pendingReferralCount : 0;
  const selectedTotal =
    selectedInvestmentCount + selectedWithdrawalCount + selectedReferralCount;
  const canStart =
    selectedTotal > 0 &&
    (includeInvestment || includeWithdrawal || includeReferral);
  const pendingOrderCount =
    pendingInvestmentCount + pendingWithdrawalCount + pendingReferralCount;
  const processedCount = completedCount + manualCheckItems.length;
  const currentItemIndex = processedCount + 1;
  const nextItemIndex = processedCount + 1;

  const summaryText = useMemo(() => {
    const parts: string[] = [];
    if (includeInvestment && pendingInvestmentCount > 0) {
      parts.push(
        `${pendingInvestmentCount} investment order${pendingInvestmentCount === 1 ? "" : "s"}`
      );
    }
    if (includeWithdrawal && pendingWithdrawalCount > 0) {
      parts.push(
        `${pendingWithdrawalCount} withdrawal order${pendingWithdrawalCount === 1 ? "" : "s"}`
      );
    }
    if (includeReferral && pendingReferralCount > 0) {
      parts.push(
        `${pendingReferralCount} referral bonus${pendingReferralCount === 1 ? "" : "es"}`
      );
    }
    if (parts.length === 0) {
      return "Select at least one queue with pending orders.";
    }
    const base = `Will run up to ${parts.join(" and ")} (${selectedTotal} total) in queue order (oldest first). Investment orders use the four-step Complete order workflow; withdrawals use TRX top-up, USDT to destination, and mark-success; referral bonuses use treasury USDT payment, on-chain confirmation, and ledger settlement. Items that fail after retries are skipped and flagged for manual check; autopilot continues with the rest.`;
    if (selectedTotal > 1) {
      return `${base} There is a 10 second pause between each order.`;
    }
    return base;
  }, [
    includeInvestment,
    includeWithdrawal,
    includeReferral,
    pendingInvestmentCount,
    pendingWithdrawalCount,
    pendingReferralCount,
    selectedTotal,
  ]);

  const showBatchCompleteToast = (outcome: AdvanceOutcome) => {
    const message = buildAutopilotCompleteToastMessage({
      itemLabel: "order",
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
        itemLabel: "order",
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

  const handleOrderSuccess = async () => {
    try {
      const outcome = await advanceAfterSuccess();
      await handleAdvanceOutcome(outcome);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  };

  const handleOrderFailure = async ({ error }: { error: string }) => {
    toast.warning("Skipping order — manual check needed");
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
        itemLabel: "order",
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
      <DialogTrigger
        disabled={pendingOrderCount === 0}
        className={buttonVariants({ variant: "default", size: "sm" })}
      >
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
                <DialogTitle className="text-xl">Order autopilot</DialogTitle>
                <DialogDescription className="text-base leading-relaxed">
                  Run admin automation for pending investment, withdrawal, and
                  referral orders in the queue.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-3 sm:grid sm:grid-cols-3">
                <ModeCard
                  title="Investment orders"
                  description="Manual subscription orders: TRX top-up, USDT to treasury, recover sponsored TRX, mark successful."
                  count={pendingInvestmentCount}
                  countLabel={
                    pendingInvestmentCount === 1 ? "order" : "orders"
                  }
                  selected={includeInvestment}
                  onToggle={() => setIncludeInvestment((value) => !value)}
                />
                <ModeCard
                  title="Withdrawal orders"
                  description="Pending withdrawals: TRX top-up, USDT to the user’s destination address, mark successful."
                  count={pendingWithdrawalCount}
                  countLabel={
                    pendingWithdrawalCount === 1 ? "order" : "orders"
                  }
                  selected={includeWithdrawal}
                  onToggle={() => setIncludeWithdrawal((value) => !value)}
                />
                <ModeCard
                  title="Referral bonuses"
                  description="Pay invitee/inviter bonuses and principal recovery from treasury."
                  count={pendingReferralCount}
                  countLabel={
                    pendingReferralCount === 1 ? "bonus" : "bonuses"
                  }
                  selected={includeReferral}
                  onToggle={() => setIncludeReferral((value) => !value)}
                />
              </div>

              <div className="rounded-xl border bg-muted/20 px-4 py-4">
                <p className="text-sm font-medium text-foreground">
                  {selectedTotal} selected · {pendingOrderCount} pending total
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{summaryText}</p>
              </div>

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
          <OrderAutopilotCountdownPanel
            completedCount={processedCount}
            initialTotal={initialTotal}
            nextIndex={nextItemIndex}
            countdownSecondsLeft={countdownSecondsLeft}
            pendingCandidate={pendingCandidate}
            onStop={handleStopAutopilot}
          />
        ) : phase === "summary" ? (
          <AutopilotBatchSummaryPanel
            title="Order autopilot finished"
            itemLabel="order"
            completedCount={completedCount}
            manualCheckItems={manualCheckItems}
            onClose={handleSummaryClose}
          />
        ) : currentCandidate ? (
          <OrderAutopilotBatchRunner
            key={`${currentCandidate.orderType}:${currentCandidate.orderId}`}
            candidate={currentCandidate}
            orderIndex={currentItemIndex}
            initialTotal={initialTotal}
            onSuccess={handleOrderSuccess}
            onFailure={handleOrderFailure}
            onCancel={handleCancelAutopilot}
            onRegisterCancel={registerActiveWorkflowCancel}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
