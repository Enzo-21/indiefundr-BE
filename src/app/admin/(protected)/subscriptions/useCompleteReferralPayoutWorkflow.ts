"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminBroadcastReferralPayout,
  adminCompleteReferralPayout,
} from "@/actions/admin/referralPayoutOrders";
import { adminGetTransactionStatus } from "@/actions/admin/purchaseOrders";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import type {
  AdminWorkflowStepSnapshot,
  AdminWorkflowStepState,
} from "@/lib/admin/workflowStepUi";
import {
  COMPLETE_ORDER_CHAIN_TIMEOUT_MS,
  COMPLETE_ORDER_POLL_MS,
  type CompleteOrderRunResult,
  type CompleteOrderSeed,
} from "./useCompleteOrderWorkflow";

export type CompleteReferralPayoutStepId = "broadcast" | "confirm" | "complete";

const STEP_LABELS: Record<CompleteReferralPayoutStepId, string> = {
  broadcast: "USDT payment",
  confirm: "On-chain confirmation",
  complete: "Complete payout",
};

const MANUAL_SKIP_DETAIL =
  "Marked complete manually — will skip during automation";

function initialSteps(): AdminWorkflowStepSnapshot[] {
  return (["broadcast", "confirm", "complete"] as const).map((id) => ({
    id,
    label: STEP_LABELS[id],
    state: "idle" as AdminWorkflowStepState,
    detail: "",
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTronscanTxUrl(txId: string): string {
  const network = process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK ?? "testnet";
  const base =
    network === "mainnet"
      ? "https://tronscan.org"
      : "https://shasta.tronscan.org";
  return `${base}/#/transaction/${txId}`;
}

function logReferralWorkflow(
  orderId: string,
  stepId: CompleteReferralPayoutStepId,
  event: string,
  payload: Record<string, unknown> = {}
): void {
  console.log("[admin-complete-referral-payout]", {
    orderId,
    step: stepId,
    event,
    ...payload,
  });
}

function buildManualSkippedStep(
  step: AdminWorkflowStepSnapshot,
  seed?: CompleteOrderSeed
): AdminWorkflowStepSnapshot {
  if (step.id === "broadcast" && seed?.usdtTxId) {
    return {
      ...step,
      state: "skipped",
      manualSkip: true,
      detail: MANUAL_SKIP_DETAIL,
      txId: seed.usdtTxId,
      tronscanUrl: seed.usdtTronscanUrl ?? getTronscanTxUrl(seed.usdtTxId),
    };
  }
  return {
    ...step,
    state: "skipped",
    manualSkip: true,
    detail: MANUAL_SKIP_DETAIL,
    txId: null,
    tronscanUrl: null,
  };
}

export function useCompleteReferralPayoutWorkflow(
  orderId: string,
  costUsdt: number,
  seed?: CompleteOrderSeed
) {
  const [steps, setSteps] = useState<AdminWorkflowStepSnapshot[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const stepsRef = useRef(steps);
  const seedRef = useRef(seed);

  seedRef.current = seed;

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  const patchStep = useCallback(
    (
      id: CompleteReferralPayoutStepId,
      patch: Partial<Omit<AdminWorkflowStepSnapshot, "id" | "label">>
    ) => {
      setSteps((prev) =>
        prev.map((step) => (step.id === id ? { ...step, ...patch } : step))
      );
    },
    []
  );

  const isStepManuallySkipped = useCallback(
    (stepId: CompleteReferralPayoutStepId) => {
      return (
        stepsRef.current.find((step) => step.id === stepId)?.manualSkip === true
      );
    },
    []
  );

  const resetSteps = useCallback(() => {
    setSteps(initialSteps());
    setError(null);
  }, []);

  const applySeedFromOrder = useCallback(() => {
    const currentSeed = seedRef.current;
    if (!currentSeed) {
      return;
    }

    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === "broadcast" && currentSeed.usdtTxId) {
          return buildManualSkippedStep(step, currentSeed);
        }
        return step;
      })
    );
  }, []);

  const toggleManualStep = useCallback(
    (stepId: CompleteReferralPayoutStepId): string[] => {
      if (running) {
        return [];
      }

      const current = stepsRef.current.find((step) => step.id === stepId);
      if (!current) {
        return [];
      }

      const nextManual = !current.manualSkip;
      const warnings: string[] = [];

      if (nextManual) {
        if (stepId === "broadcast" && !seedRef.current?.usdtTxId) {
          warnings.push(
            "No USDT tx recorded on this order — complete step may fail later."
          );
        }
        if (stepId === "complete") {
          warnings.push(
            "Skipping complete will not settle the referral payout in the database."
          );
        }
      }

      setSteps((prev) =>
        prev.map((step) => {
          if (step.id !== stepId) {
            return step;
          }
          if (nextManual) {
            return buildManualSkippedStep(step, seedRef.current);
          }
          return {
            ...step,
            state: "idle",
            manualSkip: false,
            detail: "",
            txId: null,
            tronscanUrl: null,
          };
        })
      );

      logReferralWorkflow(orderId, stepId, "manual_step_toggle", {
        manualSkip: nextManual,
      });

      return warnings;
    },
    [orderId, running]
  );

  const prepareRunBeforeStart = useCallback(() => {
    setError(null);
    setSteps((prev) =>
      prev.map((step) => {
        if (step.manualSkip) {
          return step;
        }
        if (step.state === "idle") {
          return step;
        }
        return {
          ...step,
          state: "idle" as const,
          detail: "",
          txId: null,
          tronscanUrl: null,
          manualSkip: false,
        };
      })
    );
  }, []);

  const getBroadcastTxId = useCallback((): string | null => {
    const broadcastStep = stepsRef.current.find((step) => step.id === "broadcast");
    if (broadcastStep?.txId) {
      return broadcastStep.txId;
    }
    if (broadcastStep?.manualSkip && seedRef.current?.usdtTxId) {
      return seedRef.current.usdtTxId;
    }
    return null;
  }, []);

  const pollTransaction = useCallback(
    async (txId: string): Promise<void> => {
      const deadline = Date.now() + COMPLETE_ORDER_CHAIN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (abortRef.current) {
          throw new Error("Cancelled");
        }
        const result = await adminGetTransactionStatus(txId, true);
        if (!result.ok) {
          throw new Error(result.error.msg);
        }
        if (result.data.status === "success") {
          logReferralWorkflow(orderId, "confirm", "poll_success", { txId });
          return;
        }
        if (result.data.status === "failed") {
          const message =
            result.data.message ?? "Transaction failed on-chain";
          patchStep("confirm", {
            state: "failed",
            detail: message,
            txId,
            tronscanUrl: getTronscanTxUrl(txId),
          });
          throw new Error(message);
        }
        await sleep(COMPLETE_ORDER_POLL_MS);
      }
      logReferralWorkflow(orderId, "confirm", "poll_timeout", { txId });
      throw new Error("Timed out waiting for on-chain confirmation");
    },
    [orderId, patchStep]
  );

  const runBroadcastStep = useCallback(async () => {
    if (isStepManuallySkipped("broadcast")) {
      logReferralWorkflow(orderId, "broadcast", "step_manually_skipped");
      return;
    }

    logReferralWorkflow(orderId, "broadcast", "step_start");
    patchStep("broadcast", {
      state: "running",
      detail: `Sending ${formatUsdtDisplay(costUsdt)} USDT from treasury…`,
      txId: null,
      tronscanUrl: null,
    });

    const broadcastResult = await adminBroadcastReferralPayout(orderId);
    if (!broadcastResult.ok) {
      throw new Error(broadcastResult.error.msg);
    }

    const txId = broadcastResult.data?.txId;
    if (!txId) {
      throw new Error("Broadcast succeeded but no transaction id returned");
    }

    const tronscanUrl = getTronscanTxUrl(txId);
    patchStep("broadcast", {
      state: "success",
      detail: "USDT payment broadcast",
      txId,
      tronscanUrl,
    });
    logReferralWorkflow(orderId, "broadcast", "step_success", { txId });
  }, [costUsdt, isStepManuallySkipped, orderId, patchStep]);

  const runConfirmStep = useCallback(async () => {
    if (isStepManuallySkipped("confirm")) {
      logReferralWorkflow(orderId, "confirm", "step_manually_skipped");
      return;
    }

    const txId = getBroadcastTxId();
    if (!txId) {
      throw new Error("No USDT transaction to confirm");
    }

    logReferralWorkflow(orderId, "confirm", "step_start", { txId });
    patchStep("confirm", {
      state: "waiting_chain",
      detail: "Waiting for USDT confirmation on-chain…",
      txId,
      tronscanUrl: getTronscanTxUrl(txId),
    });

    await pollTransaction(txId);

    patchStep("confirm", {
      state: "success",
      detail: "USDT confirmed on-chain",
      txId,
      tronscanUrl: getTronscanTxUrl(txId),
    });
    logReferralWorkflow(orderId, "confirm", "step_success", { txId });
  }, [getBroadcastTxId, isStepManuallySkipped, orderId, patchStep, pollTransaction]);

  const runCompleteStep = useCallback(async () => {
    if (isStepManuallySkipped("complete")) {
      logReferralWorkflow(orderId, "complete", "step_manually_skipped");
      return;
    }

    const txId = getBroadcastTxId();
    logReferralWorkflow(orderId, "complete", "step_start");
    patchStep("complete", {
      state: "running",
      detail: "Completing referral payout…",
    });

    const result = await adminCompleteReferralPayout(
      orderId,
      txId ?? undefined
    );
    if (!result.ok) {
      throw new Error(result.error.msg);
    }

    patchStep("complete", {
      state: "success",
      detail: "Referral payout completed",
    });
    logReferralWorkflow(orderId, "complete", "step_success");
  }, [getBroadcastTxId, isStepManuallySkipped, orderId, patchStep]);

  const run = useCallback(async (): Promise<CompleteOrderRunResult> => {
    abortRef.current = false;
    setRunning(true);
    prepareRunBeforeStart();
    logReferralWorkflow(orderId, "broadcast", "workflow_start", { costUsdt });

    try {
      const allManual = stepsRef.current.every((step) => step.manualSkip);
      if (allManual) {
        logReferralWorkflow(orderId, "complete", "workflow_all_manual");
        return { success: true, allManual: true };
      }

      await runBroadcastStep();
      await runConfirmStep();
      await runCompleteStep();
      logReferralWorkflow(orderId, "complete", "workflow_success");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const hasFailedStep = stepsRef.current.some(
        (step) => step.state === "failed"
      );
      const hasInFlightStep = stepsRef.current.some(
        (step) =>
          step.state === "waiting_chain" ||
          step.state === "running" ||
          step.state === "retry_wait"
      );
      const interrupted =
        message === "Cancelled" ||
        (hasInFlightStep &&
          !hasFailedStep &&
          message !== "Timed out waiting for on-chain confirmation");
      if (message !== "Cancelled") {
        setError(message);
        logReferralWorkflow(orderId, "complete", "workflow_failed", {
          error: message,
        });
      }
      return {
        success: false,
        error: message,
        interrupted,
      };
    } finally {
      setRunning(false);
    }
  }, [
    costUsdt,
    orderId,
    prepareRunBeforeStart,
    runBroadcastStep,
    runConfirmStep,
    runCompleteStep,
  ]);

  const cancel = useCallback(() => {
    abortRef.current = true;
  }, []);

  const manualSkipCount = steps.filter((step) => step.manualSkip).length;

  return {
    steps,
    running,
    error,
    retryCountdownUntil: null as Date | null,
    manualSkipCount,
    run,
    cancel,
    resetSteps,
    applySeedFromOrder,
    toggleManualStep,
  };
}
