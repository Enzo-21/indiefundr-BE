"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminGetTransactionStatus } from "@/actions/admin/purchaseOrders";
import {
  adminWithdrawalBroadcastTrxTopUp,
  adminWithdrawalBroadcastUsdt,
  adminWithdrawalGetEstimate,
  adminWithdrawalMarkSuccess,
} from "@/actions/admin/withdrawals";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import {
  COMPLETE_ORDER_CHAIN_TIMEOUT_MS,
  COMPLETE_ORDER_MAX_FUEL_RETRIES,
  COMPLETE_ORDER_POLL_MS,
  COMPLETE_ORDER_RETRY_WAIT_MS,
  type CompleteOrderRunResult,
  type CompleteOrderSeed,
  type CompleteOrderStepSnapshot,
  type CompleteOrderStepState,
} from "./useCompleteOrderWorkflow";

const TRX_TOPUP_BUFFER_RATIO = 1.5;

export type CompleteWithdrawalStepId = "trx" | "usdt" | "complete";

const STEP_LABELS: Record<CompleteWithdrawalStepId, string> = {
  trx: "TRX confirmation",
  usdt: "USDT payment",
  complete: "Mark successful",
};

const MANUAL_SKIP_DETAIL =
  "Marked complete manually — will skip during automation";

function initialSteps(): CompleteOrderStepSnapshot[] {
  return (["trx", "usdt", "complete"] as const).map((id) => ({
    id,
    label: STEP_LABELS[id],
    state: "idle" as CompleteOrderStepState,
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

function formatTrx(value: number): string {
  return value.toFixed(value < 1 ? 4 : 2);
}

function logWithdrawalWorkflow(
  orderId: string,
  stepId: CompleteWithdrawalStepId,
  event: string,
  payload: Record<string, unknown> = {}
): void {
  console.log("[admin-complete-withdrawal]", {
    orderId,
    step: stepId,
    event,
    ...payload,
  });
}

function isRetryableFuelError(code: string, message: string): boolean {
  return (
    code === "RETRYABLE_FUEL" ||
    /insufficient|bandwidth|energy|out_of_energy|not enough energy|resource insufficient/i.test(
      message
    )
  );
}

function buildManualSkippedStep(
  step: CompleteOrderStepSnapshot,
  seed?: CompleteOrderSeed
): CompleteOrderStepSnapshot {
  if (step.id === "trx" && seed?.topUpTxId) {
    return {
      ...step,
      state: "skipped",
      manualSkip: true,
      detail: MANUAL_SKIP_DETAIL,
      txId: seed.topUpTxId,
      tronscanUrl: seed.topUpTronscanUrl ?? getTronscanTxUrl(seed.topUpTxId),
    };
  }
  if (step.id === "usdt" && seed?.usdtTxId) {
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

type PollFailure = {
  outcome: "failed";
  message: string;
  retryable: boolean;
  feeTrx: number;
};

export function useCompleteWithdrawalWorkflow(
  orderId: string,
  costUsdt: number,
  seed?: CompleteOrderSeed
) {
  const [steps, setSteps] = useState<CompleteOrderStepSnapshot[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdownUntil, setRetryCountdownUntil] = useState<Date | null>(
    null
  );
  const abortRef = useRef(false);
  const minEstimatedTrxRef = useRef(0);
  const stepsRef = useRef(steps);
  const seedRef = useRef(seed);

  seedRef.current = seed;

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  const patchStep = useCallback(
    (
      id: CompleteWithdrawalStepId,
      patch: Partial<Omit<CompleteOrderStepSnapshot, "id" | "label">>
    ) => {
      setSteps((prev) =>
        prev.map((step) => (step.id === id ? { ...step, ...patch } : step))
      );
    },
    []
  );

  const isStepManuallySkipped = useCallback((stepId: CompleteWithdrawalStepId) => {
    return stepsRef.current.find((step) => step.id === stepId)?.manualSkip === true;
  }, []);

  const resetSteps = useCallback(() => {
    setSteps(initialSteps());
    setError(null);
    setRetryCountdownUntil(null);
    minEstimatedTrxRef.current = 0;
  }, []);

  const applySeedFromOrder = useCallback(() => {
    const currentSeed = seedRef.current;
    if (!currentSeed) {
      return;
    }

    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === "trx" && currentSeed.topUpTxId) {
          return buildManualSkippedStep(step, currentSeed);
        }
        if (step.id === "usdt" && currentSeed.usdtTxId) {
          return buildManualSkippedStep(step, currentSeed);
        }
        return step;
      })
    );
  }, []);

  const toggleManualStep = useCallback(
    (stepId: CompleteWithdrawalStepId): string[] => {
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
        if (stepId === "usdt" && !seedRef.current?.usdtTxId) {
          warnings.push(
            "No USDT tx recorded on this order — mark-success may fail later."
          );
        }
        if (stepId === "complete") {
          warnings.push(
            "Skipping mark-success will not settle the withdrawal in the database."
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

      logWithdrawalWorkflow(orderId, stepId, "manual_step_toggle", {
        manualSkip: nextManual,
      });

      return warnings;
    },
    [orderId, running]
  );

  const prepareRunBeforeStart = useCallback(() => {
    setError(null);
    setRetryCountdownUntil(null);
    minEstimatedTrxRef.current = 0;
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

  const pollTransaction = useCallback(
    async (
      stepId: CompleteWithdrawalStepId,
      txId: string,
      expectUsdtTransfer: boolean
    ): Promise<{ outcome: "success" } | PollFailure> => {
      const deadline = Date.now() + COMPLETE_ORDER_CHAIN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (abortRef.current) {
          throw new Error("Cancelled");
        }
        const result = await adminGetTransactionStatus(txId, expectUsdtTransfer);
        if (!result.ok) {
          throw new Error(result.error.msg);
        }
        if (result.data.status === "success") {
          logWithdrawalWorkflow(orderId, stepId, "poll_success", { txId });
          return { outcome: "success" };
        }
        if (result.data.status === "failed") {
          const failure: PollFailure = {
            outcome: "failed",
            message: result.data.message ?? "Transaction failed on-chain",
            retryable: result.data.retryable === true,
            feeTrx: result.data.feeTrx ?? 0,
          };
          patchStep(stepId, {
            state: "failed",
            detail: failure.message,
            txId,
            tronscanUrl: getTronscanTxUrl(txId),
          });
          return failure;
        }
        await sleep(COMPLETE_ORDER_POLL_MS);
      }
      logWithdrawalWorkflow(orderId, stepId, "poll_timeout", { txId });
      throw new Error("Timed out waiting for on-chain confirmation");
    },
    [orderId, patchStep]
  );

  const waitFuelRetry = useCallback(async () => {
    const until = new Date(Date.now() + COMPLETE_ORDER_RETRY_WAIT_MS);
    setRetryCountdownUntil(until);
    setError(null);
    patchStep("trx", {
      state: "retry_wait",
      detail: "Waiting 60s before retrying TRX top-up…",
    });
    while (Date.now() < until.getTime()) {
      if (abortRef.current) {
        throw new Error("Cancelled");
      }
      await sleep(500);
    }
    setRetryCountdownUntil(null);
  }, [patchStep]);

  const resetStepIfNotManual = useCallback(
    (stepId: CompleteWithdrawalStepId) => {
      if (isStepManuallySkipped(stepId)) {
        return;
      }
      patchStep(stepId, { state: "idle", detail: "" });
    },
    [isStepManuallySkipped, patchStep]
  );

  const runTrxStep = useCallback(async () => {
    if (isStepManuallySkipped("trx")) {
      logWithdrawalWorkflow(orderId, "trx", "step_manually_skipped");
      return;
    }

    logWithdrawalWorkflow(orderId, "trx", "step_start");
    const minEstimatedTrx = minEstimatedTrxRef.current;
    patchStep("trx", {
      state: "running",
      detail: "Estimating network fees…",
      txId: null,
      tronscanUrl: null,
    });

    const estimateResult = await adminWithdrawalGetEstimate(orderId);
    if (!estimateResult.ok) {
      throw new Error(estimateResult.error.msg);
    }

    const estimate = estimateResult.data;
    const needed = Math.max(estimate.estimatedTrx, minEstimatedTrx);
    const targetTrx = parseFloat(
      (needed * TRX_TOPUP_BUFFER_RATIO).toFixed(6)
    );
    const topUpAmount = parseFloat(
      Math.max(0, targetTrx - estimate.trxBalance).toFixed(6)
    );

    if (topUpAmount <= 0) {
      patchStep("trx", {
        state: "skipped",
        detail: `Wallet has enough TRX (${formatTrx(estimate.trxBalance)} TRX) for estimated ${formatTrx(needed)} TRX — skipping top-up`,
      });
      logWithdrawalWorkflow(orderId, "trx", "step_skipped", {
        trxBalance: estimate.trxBalance,
        needed,
      });
      return;
    }

    patchStep("trx", {
      state: "running",
      detail: `Need ${formatTrx(needed)} TRX → sending ${formatTrx(topUpAmount)} TRX (${Math.round((TRX_TOPUP_BUFFER_RATIO - 1) * 100)}% buffer)…`,
    });

    const broadcastResult = await adminWithdrawalBroadcastTrxTopUp(orderId);
    if (!broadcastResult.ok) {
      throw new Error(broadcastResult.error.msg);
    }

    const broadcast = broadcastResult.data;
    if (broadcast.skipped || !broadcast.txId) {
      patchStep("trx", {
        state: "skipped",
        detail: `Wallet has enough TRX (${formatTrx(broadcast.trxBalance)} TRX) — skipping top-up`,
      });
      logWithdrawalWorkflow(orderId, "trx", "step_skipped", {
        trxBalance: broadcast.trxBalance,
      });
      return;
    }

    const tronscanUrl = getTronscanTxUrl(broadcast.txId);
    patchStep("trx", {
      state: "waiting_chain",
      detail: "Waiting for TRX confirmation on-chain…",
      txId: broadcast.txId,
      tronscanUrl,
    });

    const poll = await pollTransaction("trx", broadcast.txId, false);
    if (poll.outcome === "failed") {
      throw new Error(poll.message);
    }

    patchStep("trx", {
      state: "success",
      detail: `TRX confirmed on-chain (${formatTrx(broadcast.amountTrx)} TRX sent)`,
      txId: broadcast.txId,
      tronscanUrl,
    });
    logWithdrawalWorkflow(orderId, "trx", "step_success", {
      txId: broadcast.txId,
      amountTrx: broadcast.amountTrx,
    });
  }, [isStepManuallySkipped, orderId, patchStep, pollTransaction]);

  const handleFuelRetry = useCallback(
    async (fuelRetriesLeft: number, failureMessage: string, feeTrx: number) => {
      if (fuelRetriesLeft <= 0) {
        throw new Error(failureMessage);
      }
      patchStep("usdt", {
        state: "failed",
        detail: `${failureMessage} — retrying from TRX step`,
      });
      if (feeTrx > 0) {
        minEstimatedTrxRef.current = Math.max(minEstimatedTrxRef.current, feeTrx);
      }
      await waitFuelRetry();
      resetStepIfNotManual("trx");
      resetStepIfNotManual("usdt");
      return true;
    },
    [patchStep, resetStepIfNotManual, waitFuelRetry]
  );

  const runUsdtStep = useCallback(
    async (fuelRetriesLeft: number): Promise<"done" | "retry"> => {
      if (isStepManuallySkipped("usdt")) {
        logWithdrawalWorkflow(orderId, "usdt", "step_manually_skipped");
        return "done";
      }

      logWithdrawalWorkflow(orderId, "usdt", "step_start", { fuelRetriesLeft });
      patchStep("usdt", {
        state: "running",
        detail: `Broadcasting ${formatUsdtDisplay(costUsdt)} USDT to destination…`,
        txId: null,
        tronscanUrl: null,
      });

      const broadcastResult = await adminWithdrawalBroadcastUsdt(orderId);
      if (!broadcastResult.ok) {
        if (
          isRetryableFuelError(
            broadcastResult.error.code,
            broadcastResult.error.msg
          )
        ) {
          await handleFuelRetry(fuelRetriesLeft, broadcastResult.error.msg, 0);
          return "retry";
        }
        throw new Error(broadcastResult.error.msg);
      }

      const txId = broadcastResult.data;
      const tronscanUrl = getTronscanTxUrl(txId);
      patchStep("usdt", {
        state: "waiting_chain",
        detail: "Waiting for USDT confirmation on-chain…",
        txId,
        tronscanUrl,
      });

      const poll = await pollTransaction("usdt", txId, true);
      if (poll.outcome === "failed") {
        if (poll.retryable) {
          await handleFuelRetry(fuelRetriesLeft, poll.message, poll.feeTrx);
          return "retry";
        }
        throw new Error(poll.message);
      }

      patchStep("usdt", {
        state: "success",
        detail: "USDT confirmed on-chain",
        txId,
        tronscanUrl,
      });
      logWithdrawalWorkflow(orderId, "usdt", "step_success", { txId });
      return "done";
    },
    [costUsdt, handleFuelRetry, isStepManuallySkipped, orderId, patchStep, pollTransaction]
  );

  const runCompleteStep = useCallback(async () => {
    if (isStepManuallySkipped("complete")) {
      logWithdrawalWorkflow(orderId, "complete", "step_manually_skipped");
      return;
    }

    logWithdrawalWorkflow(orderId, "complete", "step_start");
    patchStep("complete", {
      state: "running",
      detail: "Marking withdrawal successful…",
    });
    const result = await adminWithdrawalMarkSuccess(orderId);
    if (!result.ok) {
      throw new Error(result.error.msg);
    }
    patchStep("complete", {
      state: "success",
      detail: "Withdrawal marked successful",
    });
    logWithdrawalWorkflow(orderId, "complete", "step_success");
  }, [isStepManuallySkipped, orderId, patchStep]);

  const run = useCallback(async (): Promise<CompleteOrderRunResult> => {
    abortRef.current = false;
    setRunning(true);
    prepareRunBeforeStart();
    logWithdrawalWorkflow(orderId, "trx", "workflow_start", { costUsdt });

    try {
      const allManual = stepsRef.current.every((step) => step.manualSkip);
      if (allManual) {
        logWithdrawalWorkflow(orderId, "complete", "workflow_all_manual");
        return { success: true, allManual: true };
      }

      let fuelRetriesLeft = COMPLETE_ORDER_MAX_FUEL_RETRIES;

      while (true) {
        await runTrxStep();
        const usdtOutcome = await runUsdtStep(fuelRetriesLeft);
        if (usdtOutcome === "retry") {
          fuelRetriesLeft -= 1;
          continue;
        }
        break;
      }

      await runCompleteStep();
      logWithdrawalWorkflow(orderId, "complete", "workflow_success");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const hasFailedStep = stepsRef.current.some((step) => step.state === "failed");
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
        logWithdrawalWorkflow(orderId, "complete", "workflow_failed", {
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
      setRetryCountdownUntil(null);
    }
  }, [
    costUsdt,
    orderId,
    prepareRunBeforeStart,
    runCompleteStep,
    runTrxStep,
    runUsdtStep,
  ]);

  const cancel = useCallback(() => {
    abortRef.current = true;
  }, []);

  const manualSkipCount = steps.filter((step) => step.manualSkip).length;

  return {
    steps,
    running,
    error,
    retryCountdownUntil,
    manualSkipCount,
    run,
    cancel,
    resetSteps,
    applySeedFromOrder,
    toggleManualStep,
  };
}
