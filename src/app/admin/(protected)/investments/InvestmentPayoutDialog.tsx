"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { isAdminWorkflowDismissBlocked } from "@/lib/admin/workflowStepUi";
import { cn } from "@/lib/utils";
import type { InvestmentPayoutMode } from "@/services/admin/investmentPayoutFulfillment";
import { InvestmentPayoutWorkflowPanel } from "./InvestmentPayoutWorkflowPanel";
import {
  type InvestmentPayoutSeed,
  type InvestmentPayoutStepId,
  useInvestmentPayoutWorkflow,
} from "./useInvestmentPayoutWorkflow";

const STEP_ORDER: InvestmentPayoutStepId[] = [
  "validate",
  "prepare",
  "broadcast",
  "complete",
];

export function InvestmentPayoutDialog({
  investmentId,
  userEmail,
  amountUsdt,
  mode,
  triggerLabel,
  triggerVariant = "outline",
  disabled = false,
  disabledReason,
  seed,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
  children,
}: {
  investmentId: string;
  userEmail: string;
  amountUsdt: number;
  mode: InvestmentPayoutMode;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "secondary" | "destructive";
  disabled?: boolean;
  disabledReason?: string | null;
  seed?: InvestmentPayoutSeed;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const {
    steps,
    running,
    error,
    run,
    cancel,
    resetSteps,
    applySeed,
  } = useInvestmentPayoutWorkflow(investmentId, mode, seed);

  const wasOpenRef = useRef(false);
  const isSurplus = mode === "surplus";
  const title = isSurplus ? "Pay with surplus" : "Pay investment now";
  const description = isSurplus
    ? "Automate surplus FIFO payout: validate, draw surplus, send USDT, and confirm redemption."
    : "Automate unlocked payout: validate, claim, send USDT from treasury, and confirm redemption.";

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      void applySeed();
      return;
    }
    if (wasOpenRef.current) {
      cancel();
      resetSteps();
      wasOpenRef.current = false;
    }
  }, [open, cancel, resetSteps, applySeed]);

  const blockClose = isAdminWorkflowDismissBlocked({
    running,
    steps,
  });

  const handleOpenChange = (next: boolean) => {
    if (blockClose && !next) {
      return;
    }
    setOpen(next);
  };

  const handleStart = async () => {
    const result = await run();
    if (result.success) {
      toast.success(isSurplus ? "Surplus payout completed" : "Payout completed");
      setOpen(false);
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      disablePointerDismissal={blockClose}
    >
      {!hideTrigger ? (
        <DialogTrigger
          disabled={disabled}
          title={disabled ? disabledReason ?? "Not available" : undefined}
          className={cn(
            buttonVariants({ variant: triggerVariant, size: "sm" }),
            disabled && "pointer-events-none opacity-50"
          )}
        >
          {triggerLabel}
        </DialogTrigger>
      ) : null}
      {children}
      <DialogContent
        showCloseButton={!blockClose}
        className="gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl"
      >
        <InvestmentPayoutWorkflowPanel
          steps={steps}
          stepOrder={STEP_ORDER}
          running={running}
          error={error}
          blockClose={blockClose}
          header={
            <DialogHeader className="gap-3 text-left">
              <DialogTitle className="text-xl">{title}</DialogTitle>
              <DialogDescription className="text-base leading-relaxed">
                {description}
              </DialogDescription>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  {userEmail}
                </span>
                <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {formatUsdtDisplay(amountUsdt)} USDT
                </span>
                <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  {isSurplus ? "Surplus FIFO" : "Normal unlock"}
                </span>
              </div>
            </DialogHeader>
          }
          onClose={() => setOpen(false)}
          onPrimaryAction={() => {
            void handleStart();
          }}
          primaryDisabled={disabled}
        />
      </DialogContent>
    </Dialog>
  );
}
