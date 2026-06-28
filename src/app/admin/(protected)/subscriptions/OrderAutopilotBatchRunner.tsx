"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { LiveCountdown } from "@/app/admin/_components/LiveCountdown";
import { InvestmentPayoutWorkflowPanel } from "@/app/admin/(protected)/investments/InvestmentPayoutWorkflowPanel";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isAutopilotWorkflowInterruptedFailure } from "@/lib/admin/autopilotBatch";
import type { AdminWorkflowStepSnapshot } from "@/lib/admin/workflowStepUi";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import type { AutopilotOrderCandidate } from "./useOrderAutopilot";
import {
  type CompleteOrderStepId,
  useCompleteOrderWorkflow,
} from "./useCompleteOrderWorkflow";
import {
  type CompleteWithdrawalStepId,
  useCompleteWithdrawalWorkflow,
} from "./useCompleteWithdrawalWorkflow";
import {
  type CompleteReferralPayoutStepId,
  useCompleteReferralPayoutWorkflow,
} from "./useCompleteReferralPayoutWorkflow";

const INVEST_STEP_ORDER: CompleteOrderStepId[] = [
  "trx",
  "usdt",
  "recover",
  "complete",
];
const WITHDRAW_STEP_ORDER: CompleteWithdrawalStepId[] = ["trx", "usdt", "complete"];
const REFERRAL_STEP_ORDER: CompleteReferralPayoutStepId[] = [
  "broadcast",
  "confirm",
  "complete",
];

function InvestmentOrderAutopilotRunner({
  candidate,
  orderIndex,
  initialTotal,
  onSuccess,
  onFailure,
  onCancel,
  onRegisterCancel,
}: {
  candidate: AutopilotOrderCandidate;
  orderIndex: number;
  initialTotal: number;
  onSuccess: () => Promise<void>;
  onFailure: (payload: { error: string }) => Promise<void>;
  onCancel: () => void;
  onRegisterCancel?: (cancelActiveWorkflow: (() => void) | null) => void;
}) {
  const workflow = useCompleteOrderWorkflow(candidate.orderId, candidate.costUsdt, {
    topUpTxId: candidate.topUpTxId,
    topUpTronscanUrl: candidate.topUpTronscanUrl,
    usdtTxId: candidate.usdtTxId,
    usdtTronscanUrl: candidate.usdtTronscanUrl,
  });

  return (
    <OrderAutopilotWorkflowShell
      candidate={candidate}
      orderIndex={orderIndex}
      initialTotal={initialTotal}
      stepOrder={INVEST_STEP_ORDER}
      workflowDescription="Running the same automation as Complete order. Failed orders are skipped and flagged for manual check."
      onSuccess={onSuccess}
      onFailure={onFailure}
      onCancel={onCancel}
      onRegisterCancel={onRegisterCancel}
      workflow={workflow}
    />
  );
}

function WithdrawalOrderAutopilotRunner({
  candidate,
  orderIndex,
  initialTotal,
  onSuccess,
  onFailure,
  onCancel,
  onRegisterCancel,
}: {
  candidate: AutopilotOrderCandidate;
  orderIndex: number;
  initialTotal: number;
  onSuccess: () => Promise<void>;
  onFailure: (payload: { error: string }) => Promise<void>;
  onCancel: () => void;
  onRegisterCancel?: (cancelActiveWorkflow: (() => void) | null) => void;
}) {
  const workflow = useCompleteWithdrawalWorkflow(
    candidate.orderId,
    candidate.costUsdt,
    {
      topUpTxId: candidate.topUpTxId,
      topUpTronscanUrl: candidate.topUpTronscanUrl,
      usdtTxId: candidate.usdtTxId,
      usdtTronscanUrl: candidate.usdtTronscanUrl,
    }
  );

  return (
    <OrderAutopilotWorkflowShell
      candidate={candidate}
      orderIndex={orderIndex}
      initialTotal={initialTotal}
      stepOrder={WITHDRAW_STEP_ORDER}
      workflowDescription="Running TRX top-up, USDT send to destination, and mark-success. Failed orders are skipped and flagged for manual check."
      onSuccess={onSuccess}
      onFailure={onFailure}
      onCancel={onCancel}
      onRegisterCancel={onRegisterCancel}
      workflow={workflow}
    />
  );
}

function ReferralOrderAutopilotRunner({
  candidate,
  orderIndex,
  initialTotal,
  onSuccess,
  onFailure,
  onCancel,
  onRegisterCancel,
}: {
  candidate: AutopilotOrderCandidate;
  orderIndex: number;
  initialTotal: number;
  onSuccess: () => Promise<void>;
  onFailure: (payload: { error: string }) => Promise<void>;
  onCancel: () => void;
  onRegisterCancel?: (cancelActiveWorkflow: (() => void) | null) => void;
}) {
  const workflow = useCompleteReferralPayoutWorkflow(
    candidate.orderId,
    candidate.costUsdt,
    {
      usdtTxId: candidate.usdtTxId,
      usdtTronscanUrl: candidate.usdtTronscanUrl,
    }
  );

  return (
    <OrderAutopilotWorkflowShell
      candidate={candidate}
      orderIndex={orderIndex}
      initialTotal={initialTotal}
      stepOrder={REFERRAL_STEP_ORDER}
      workflowDescription="Running treasury USDT payment, on-chain confirmation, and referral payout settlement. Failed orders are skipped and flagged for manual check."
      onSuccess={onSuccess}
      onFailure={onFailure}
      onCancel={onCancel}
      onRegisterCancel={onRegisterCancel}
      workflow={workflow}
    />
  );
}

function OrderAutopilotWorkflowShell({
  candidate,
  orderIndex,
  initialTotal,
  stepOrder,
  workflowDescription,
  onSuccess,
  onFailure,
  onCancel,
  onRegisterCancel,
  workflow,
}: {
  candidate: AutopilotOrderCandidate;
  orderIndex: number;
  initialTotal: number;
  stepOrder: readonly string[];
  workflowDescription: string;
  onSuccess: () => Promise<void>;
  onFailure: (payload: { error: string }) => Promise<void>;
  onCancel: () => void;
  onRegisterCancel?: (cancelActiveWorkflow: (() => void) | null) => void;
  workflow: {
    steps: AdminWorkflowStepSnapshot[];
    running: boolean;
    error: string | null;
    retryCountdownUntil: Date | null;
    run: () => Promise<{ success: boolean; error?: string; interrupted?: boolean }>;
    cancel: () => void;
    resetSteps: () => void;
    applySeedFromOrder: () => void;
  };
}) {
  const {
    steps,
    running,
    error,
    retryCountdownUntil,
    run,
    cancel,
    resetSteps,
    applySeedFromOrder,
  } = workflow;
  const [advancing, setAdvancing] = useState(false);
  const startedRef = useRef<string | null>(null);
  const userStoppedRef = useRef(false);
  const stepsRef = useRef(steps);
  const candidateKey = `${candidate.orderType}:${candidate.orderId}`;
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

  const runOrder = useCallback(async () => {
    applySeedFromOrder();
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
      void runOrder();
      return;
    }

    setAdvancing(true);
    try {
      await onFailure({
        error: result.error ?? error ?? "Order automation failed",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await onFailure({ error: message });
    } finally {
      setAdvancing(false);
      startedRef.current = null;
    }
  }, [applySeedFromOrder, candidateKey, error, onFailure, onSuccess, run]);

  useEffect(() => {
    if (startedRef.current === candidateKey) {
      return;
    }
    startedRef.current = candidateKey;
    void runOrder();
  }, [candidateKey, runOrder]);

  const awaitingChain = steps.some(
    (step) =>
      step.state === "waiting_chain" ||
      step.state === "running" ||
      step.state === "retry_wait"
  );
  const blockClose =
    running || awaitingChain || advancing || Boolean(retryCountdownUntil);

  return (
    <InvestmentPayoutWorkflowPanel
      steps={steps}
      stepOrder={[...stepOrder]}
      running={running || advancing || Boolean(retryCountdownUntil)}
      error={error}
      blockClose={blockClose}
      batchBanner={
        <>
          <div className="rounded-xl border bg-primary/5 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              Order {orderIndex} of {initialTotal}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {workflowDescription}
            </p>
          </div>
          {retryCountdownUntil ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span>Retrying after fuel failure —</span>
              <LiveCountdown target={retryCountdownUntil} />
            </div>
          ) : null}
        </>
      }
      header={
        <DialogHeader className="gap-3 text-left">
          <DialogTitle className="text-xl">Order autopilot</DialogTitle>
          <DialogDescription className="text-base leading-relaxed">
            Processing pending orders sequentially. The dialog stays open
            through on-chain confirmation for each order.
          </DialogDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
              {candidate.userEmail}
            </span>
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
              {candidate.orderType === "withdraw"
                ? "Withdrawal"
                : candidate.orderType === "referral"
                  ? candidate.kindLabel ?? "Referral payout"
                  : candidate.fundName}
            </span>
            {candidate.destinationLabel ? (
              <span
                className="max-w-full truncate rounded-md bg-muted px-2.5 py-1 font-mono text-xs font-medium text-foreground"
                title={candidate.destinationLabel}
              >
                {candidate.destinationLabel}
              </span>
            ) : null}
            <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {formatUsdtDisplay(candidate.costUsdt)} USDT
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

export function OrderAutopilotBatchRunner({
  candidate,
  orderIndex,
  initialTotal,
  onSuccess,
  onFailure,
  onCancel,
  onRegisterCancel,
}: {
  candidate: AutopilotOrderCandidate;
  orderIndex: number;
  initialTotal: number;
  onSuccess: () => Promise<void>;
  onFailure: (payload: { error: string }) => Promise<void>;
  onCancel: () => void;
  onRegisterCancel?: (cancelActiveWorkflow: (() => void) | null) => void;
}) {
  if (candidate.orderType === "withdraw") {
    return (
      <WithdrawalOrderAutopilotRunner
        candidate={candidate}
        orderIndex={orderIndex}
        initialTotal={initialTotal}
        onSuccess={onSuccess}
        onFailure={onFailure}
        onCancel={onCancel}
        onRegisterCancel={onRegisterCancel}
      />
    );
  }

  if (candidate.orderType === "referral") {
    return (
      <ReferralOrderAutopilotRunner
        candidate={candidate}
        orderIndex={orderIndex}
        initialTotal={initialTotal}
        onSuccess={onSuccess}
        onFailure={onFailure}
        onCancel={onCancel}
        onRegisterCancel={onRegisterCancel}
      />
    );
  }

  return (
    <InvestmentOrderAutopilotRunner
      candidate={candidate}
      orderIndex={orderIndex}
      initialTotal={initialTotal}
      onSuccess={onSuccess}
      onFailure={onFailure}
      onCancel={onCancel}
      onRegisterCancel={onRegisterCancel}
    />
  );
}
