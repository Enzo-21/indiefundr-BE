"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isAutopilotWorkflowInterruptedFailure } from "@/lib/admin/autopilotBatch";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { InvestmentPayoutWorkflowPanel } from "./InvestmentPayoutWorkflowPanel";
import type { AutopilotPayoutCandidate } from "./usePayoutAutopilot";
import {
  type InvestmentPayoutStepId,
  useInvestmentPayoutWorkflow,
} from "./useInvestmentPayoutWorkflow";

const STEP_ORDER: InvestmentPayoutStepId[] = [
  "validate",
  "prepare",
  "broadcast",
  "complete",
];

function modeLabel(mode: AutopilotPayoutCandidate["mode"]): string {
  return mode === "surplus" ? "Surplus FIFO" : "Normal unlock";
}

function modeTitle(mode: AutopilotPayoutCandidate["mode"]): string {
  return mode === "surplus" ? "Surplus payout" : "Normal payout";
}

export function PayoutAutopilotBatchRunner({
  candidate,
  payoutIndex,
  initialTotal,
  onSuccess,
  onFailure,
  onCancel,
  onRegisterCancel,
}: {
  candidate: AutopilotPayoutCandidate;
  payoutIndex: number;
  initialTotal: number;
  onSuccess: () => Promise<void>;
  onFailure: (payload: { error: string }) => Promise<void>;
  onCancel: () => void;
  onRegisterCancel?: (cancelActiveWorkflow: (() => void) | null) => void;
}) {
  const { steps, running, error, run, cancel, resetSteps, applySeed } =
    useInvestmentPayoutWorkflow(candidate.investmentId, candidate.mode);
  const [advancing, setAdvancing] = useState(false);
  const startedRef = useRef<string | null>(null);
  const userStoppedRef = useRef(false);
  const stepsRef = useRef(steps);
  const candidateKey = `${candidate.investmentId}:${candidate.mode}`;
  const prevCandidateKeyRef = useRef(candidateKey);

  stepsRef.current = steps;

  useEffect(() => {
    const cancelActiveWorkflow = () => {
      userStoppedRef.current = true;
      cancel();
      resetSteps();
      startedRef.current = null;
    };
    onRegisterCancel?.(cancelActiveWorkflow);
    return () => {
      onRegisterCancel?.(null);
    };
  }, [cancel, onRegisterCancel, resetSteps]);

  useEffect(() => {
    if (prevCandidateKeyRef.current === candidateKey) {
      return;
    }
    userStoppedRef.current = false;
    cancel();
    resetSteps();
    startedRef.current = null;
    prevCandidateKeyRef.current = candidateKey;
  }, [candidateKey, cancel, resetSteps]);

  const runPayout = useCallback(async () => {
    await applySeed();
    const result = await run();
    if (result.success) {
      setAdvancing(true);
      try {
        await onSuccess();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await onFailure({ error: message });
      } finally {
        setAdvancing(false);
        startedRef.current = null;
      }
      return;
    }

    if (isAutopilotWorkflowInterruptedFailure(result, stepsRef.current)) {
      if (userStoppedRef.current) {
        return;
      }
      startedRef.current = candidateKey;
      void runPayout();
      return;
    }

    setAdvancing(true);
    try {
      await onFailure({
        error: result.error ?? error ?? "Payout automation failed",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await onFailure({ error: message });
    } finally {
      setAdvancing(false);
      startedRef.current = null;
    }
  }, [applySeed, error, onFailure, onSuccess, run]);

  useEffect(() => {
    if (startedRef.current === candidateKey) {
      return;
    }
    startedRef.current = candidateKey;
    void runPayout();
  }, [candidateKey, runPayout]);

  const awaitingChain = steps.some(
    (step) => step.state === "waiting_chain" || step.state === "running"
  );
  const blockClose = running || awaitingChain || advancing;

  return (
    <InvestmentPayoutWorkflowPanel
      steps={steps}
      stepOrder={STEP_ORDER}
      running={running || advancing}
      error={error}
      blockClose={blockClose}
      batchBanner={
        <div className="rounded-xl border bg-primary/5 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            {modeTitle(candidate.mode)} · Payout {payoutIndex} of {initialTotal}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Running the same automation as Pay now / Pay with surplus. Failed
            payouts are skipped and flagged for manual check.
          </p>
        </div>
      }
      header={
        <DialogHeader className="gap-3 text-left">
          <DialogTitle className="text-xl">Payout autopilot</DialogTitle>
          <DialogDescription className="text-base leading-relaxed">
            Processing eligible investments sequentially. The dialog stays open
            through on-chain confirmation for each payout.
          </DialogDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
              {candidate.userEmail}
            </span>
            <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {formatUsdtDisplay(candidate.projectedPayoutUsdt)} USDT
            </span>
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
              {modeLabel(candidate.mode)}
            </span>
          </div>
        </DialogHeader>
      }
      onClose={() => {
        if (!blockClose) {
          onCancel();
        }
      }}
      onPrimaryAction={() => {}}
      showPrimary={false}
      closeLabel={blockClose ? "Running…" : "Cancel autopilot"}
    />
  );
}
