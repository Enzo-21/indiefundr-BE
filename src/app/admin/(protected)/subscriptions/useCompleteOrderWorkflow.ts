"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminBroadcastTrxTopUp,
  adminBroadcastUsdtPayment,
  adminGetFulfillmentEstimate,
  adminGetOrderWalletSnapshot,
  adminGetTransactionStatus,
  adminMarkOrderSuccess,
  adminRecordTrxAfterUsdt,
  adminRecoverSponsoredTrx,
  adminResetUsdtForFuelRetry,
} from "@/actions/admin/purchaseOrders";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import type { AdminOrderWalletSnapshot } from "@/services/admin/purchaseOrderFulfillment";

const TRX_TOPUP_BUFFER_RATIO = 1.5;

export const COMPLETE_ORDER_POLL_MS = 2_000;
export const COMPLETE_ORDER_CHAIN_TIMEOUT_MS = 90_000;
export const COMPLETE_ORDER_RETRY_WAIT_MS = 60_000;
export const COMPLETE_ORDER_MAX_FUEL_RETRIES = 3;

export type CompleteOrderStepId = "trx" | "usdt" | "recover" | "complete";

export type CompleteOrderStepState =
  | "idle"
  | "running"
  | "waiting_chain"
  | "success"
  | "failed"
  | "skipped"
  | "retry_wait";

export type CompleteOrderStepSnapshot = {
  id: CompleteOrderStepId;
  label: string;
  state: CompleteOrderStepState;
  detail: string;
  txId?: string | null;
  tronscanUrl?: string | null;
  manualSkip?: boolean;
};

export type CompleteOrderSeed = {
  topUpTxId?: string | null;
  topUpTronscanUrl?: string | null;
  usdtTxId?: string | null;
  usdtTronscanUrl?: string | null;
};

export type CompleteOrderRunResult = {
  success: boolean;
  allManual?: boolean;
  error?: string;
  interrupted?: boolean;
};

const STEP_LABELS: Record<CompleteOrderStepId, string> = {
  trx: "TRX confirmation",
  usdt: "USDT payment",
  recover: "Recover TRX",
  complete: "Mark successful",
};

const MANUAL_SKIP_DETAIL =
  "Marked complete manually — will skip during automation";

function initialSteps(): CompleteOrderStepSnapshot[] {
  return (["trx", "usdt", "recover", "complete"] as const).map((id) => ({
    id,
    label: STEP_LABELS[id],
    state: "idle",
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

function logCompleteOrderWorkflow(
  orderId: string,
  stepId: CompleteOrderStepId,
  event: string,
  payload: Record<string, unknown> = {}
): void {
  console.log("[admin-complete-order]", {
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

export function useCompleteOrderWorkflow(
  orderId: string,
  costUsdt: number,
  seed?: CompleteOrderSeed
) {
  const [steps, setSteps] = useState<CompleteOrderStepSnapshot[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletSnapshot, setWalletSnapshot] =
    useState<AdminOrderWalletSnapshot | null>(null);
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
      id: CompleteOrderStepId,
      patch: Partial<Omit<CompleteOrderStepSnapshot, "id" | "label">>
    ) => {
      setSteps((prev) =>
        prev.map((step) => (step.id === id ? { ...step, ...patch } : step))
      );
    },
    []
  );

  const isStepManuallySkipped = useCallback((stepId: CompleteOrderStepId) => {
    return stepsRef.current.find((step) => step.id === stepId)?.manualSkip === true;
  }, []);

  const resetSteps = useCallback(() => {
    setSteps(initialSteps());
    setError(null);
    setWalletSnapshot(null);
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
    (stepId: CompleteOrderStepId): string[] => {
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
            "Skipping mark-success will not settle the order in the database."
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

      logCompleteOrderWorkflow(orderId, stepId, "manual_step_toggle", {
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

  const refreshWalletSnapshot = useCallback(async () => {
    const result = await adminGetOrderWalletSnapshot(orderId);
    if (!result.ok) {
      throw new Error(result.error.msg);
    }
    setWalletSnapshot(result.data);
    return result.data;
  }, [orderId]);

  const pollTransaction = useCallback(
    async (
      stepId: CompleteOrderStepId,
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
          logCompleteOrderWorkflow(orderId, stepId, "poll_success", { txId });
          return { outcome: "success" };
        }
        if (result.data.status === "failed") {
          const failure: PollFailure = {
            outcome: "failed",
            message: result.data.message ?? "Transaction failed on-chain",
            retryable: result.data.retryable === true,
            feeTrx: result.data.feeTrx ?? 0,
          };
          logCompleteOrderWorkflow(orderId, stepId, "poll_failed", {
            txId,
            message: failure.message,
            retryable: failure.retryable,
            feeTrx: failure.feeTrx,
          });
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
      logCompleteOrderWorkflow(orderId, stepId, "poll_timeout", { txId });
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
    (stepId: CompleteOrderStepId) => {
      if (isStepManuallySkipped(stepId)) {
        return;
      }
      patchStep(stepId, { state: "idle", detail: "" });
    },
    [isStepManuallySkipped, patchStep]
  );

  const runTrxStep = useCallback(async () => {
    if (isStepManuallySkipped("trx")) {
      logCompleteOrderWorkflow(orderId, "trx", "step_manually_skipped");
      return;
    }

    logCompleteOrderWorkflow(orderId, "trx", "step_start");
    const minEstimatedTrx = minEstimatedTrxRef.current;
    patchStep("trx", {
      state: "running",
      detail: "Estimating network fees…",
      txId: null,
      tronscanUrl: null,
    });

    const estimateResult = await adminGetFulfillmentEstimate(orderId);
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
      await refreshWalletSnapshot();
      logCompleteOrderWorkflow(orderId, "trx", "step_skipped", {
        trxBalance: estimate.trxBalance,
        needed,
      });
      return;
    }

    patchStep("trx", {
      state: "running",
      detail: `Need ${formatTrx(needed)} TRX → sending ${formatTrx(topUpAmount)} TRX (${Math.round((TRX_TOPUP_BUFFER_RATIO - 1) * 100)}% buffer)…`,
    });

    const broadcastResult = await adminBroadcastTrxTopUp(
      orderId,
      minEstimatedTrx > 0 ? minEstimatedTrx : undefined
    );
    if (!broadcastResult.ok) {
      throw new Error(broadcastResult.error.msg);
    }

    const broadcast = broadcastResult.data;
    if (broadcast.skipped || !broadcast.txId) {
      patchStep("trx", {
        state: "skipped",
        detail: `Wallet has enough TRX (${formatTrx(broadcast.trxBalance)} TRX) — skipping top-up`,
      });
      await refreshWalletSnapshot();
      logCompleteOrderWorkflow(orderId, "trx", "step_skipped", {
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
    await refreshWalletSnapshot();
    logCompleteOrderWorkflow(orderId, "trx", "step_success", {
      txId: broadcast.txId,
      amountTrx: broadcast.amountTrx,
    });
  }, [
    isStepManuallySkipped,
    orderId,
    patchStep,
    pollTransaction,
    refreshWalletSnapshot,
  ]);

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
      const resetResult = await adminResetUsdtForFuelRetry(
        orderId,
        feeTrx > 0 ? feeTrx : undefined
      );
      if (!resetResult.ok) {
        throw new Error(resetResult.error.msg);
      }
      await waitFuelRetry();
      resetStepIfNotManual("trx");
      resetStepIfNotManual("usdt");
      resetStepIfNotManual("recover");
      return true;
    },
    [orderId, patchStep, resetStepIfNotManual, waitFuelRetry]
  );

  const runUsdtStep = useCallback(
    async (fuelRetriesLeft: number): Promise<"done" | "retry"> => {
      if (isStepManuallySkipped("usdt")) {
        logCompleteOrderWorkflow(orderId, "usdt", "step_manually_skipped");
        return "done";
      }

      logCompleteOrderWorkflow(orderId, "usdt", "step_start", {
        fuelRetriesLeft,
      });
      patchStep("usdt", {
        state: "running",
        detail: `Broadcasting ${formatUsdtDisplay(costUsdt)} USDT to treasury…`,
        txId: null,
        tronscanUrl: null,
      });

      const broadcastResult = await adminBroadcastUsdtPayment(orderId);
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

      const txId = broadcastResult.data.txId;
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
      const recordResult = await adminRecordTrxAfterUsdt(orderId);
      if (!recordResult.ok) {
        throw new Error(recordResult.error.msg);
      }
      await refreshWalletSnapshot();
      logCompleteOrderWorkflow(orderId, "usdt", "step_success", { txId });
      return "done";
    },
    [
      costUsdt,
      handleFuelRetry,
      isStepManuallySkipped,
      orderId,
      patchStep,
      pollTransaction,
      refreshWalletSnapshot,
    ]
  );

  const runRecoverStep = useCallback(async () => {
    if (isStepManuallySkipped("recover")) {
      logCompleteOrderWorkflow(orderId, "recover", "step_manually_skipped");
      return;
    }

    logCompleteOrderWorkflow(orderId, "recover", "step_start");
    patchStep("recover", {
      state: "running",
      detail: "Reading wallet balance…",
      txId: null,
      tronscanUrl: null,
    });

    const snapshot = await refreshWalletSnapshot();

    if (snapshot.sponsoredTrx <= 0) {
      patchStep("recover", {
        state: "skipped",
        detail: "No sponsored TRX to recover",
      });
      logCompleteOrderWorkflow(orderId, "recover", "step_skipped", {
        reason: "No sponsored TRX to recover",
      });
      return;
    }

    if (snapshot.recoverableTrx <= 0) {
      patchStep("recover", {
        state: "skipped",
        detail: `Balance ${formatTrx(snapshot.trxBalance)} TRX, recoverable 0 TRX (sponsored ${formatTrx(snapshot.sponsoredTrx)} TRX, sweep fee ${formatTrx(snapshot.transferFeeTrx)} TRX)`,
      });
      logCompleteOrderWorkflow(orderId, "recover", "step_skipped", {
        trxBalance: snapshot.trxBalance,
        sponsoredTrx: snapshot.sponsoredTrx,
        transferFeeTrx: snapshot.transferFeeTrx,
        recoverableTrx: snapshot.recoverableTrx,
      });
      return;
    }

    patchStep("recover", {
      state: "running",
      detail: `${formatTrx(snapshot.recoverableTrx)} TRX recoverable (wallet ${formatTrx(snapshot.trxBalance)} TRX, sponsored ${formatTrx(snapshot.sponsoredTrx)} TRX, sweep fee ${formatTrx(snapshot.transferFeeTrx)} TRX)`,
    });
    logCompleteOrderWorkflow(orderId, "recover", "preview", {
      trxBalance: snapshot.trxBalance,
      sponsoredTrx: snapshot.sponsoredTrx,
      transferFeeTrx: snapshot.transferFeeTrx,
      recoverableTrx: snapshot.recoverableTrx,
    });

    const result = await adminRecoverSponsoredTrx(orderId);
    if (!result.ok) {
      throw new Error(result.error.msg);
    }

    const recovery = result.data;
    if (recovery.skipped) {
      patchStep("recover", {
        state: "skipped",
        detail:
          recovery.reason ??
          `Balance ${formatTrx(recovery.trxBalance ?? snapshot.trxBalance)} TRX, recoverable 0 TRX`,
      });
      logCompleteOrderWorkflow(orderId, "recover", "step_skipped", {
        reason: recovery.reason,
        trxBalance: recovery.trxBalance,
        transferFeeTrx: recovery.transferFeeTrx,
      });
      return;
    }

    if (!recovery.sweepTxId || recovery.recoveredTrx <= 0) {
      throw new Error("TRX recovery broadcast failed");
    }

    const tronscanUrl = getTronscanTxUrl(recovery.sweepTxId);
    patchStep("recover", {
      state: "waiting_chain",
      detail: `Returning ${formatTrx(recovery.recoveredTrx)} TRX to treasury…`,
      txId: recovery.sweepTxId,
      tronscanUrl,
    });

    const poll = await pollTransaction("recover", recovery.sweepTxId, false);
    if (poll.outcome === "failed") {
      throw new Error(poll.message);
    }

    patchStep("recover", {
      state: "success",
      detail: `Returned ${formatTrx(recovery.recoveredTrx)} TRX to treasury`,
      txId: recovery.sweepTxId,
      tronscanUrl,
    });
    await refreshWalletSnapshot();
    logCompleteOrderWorkflow(orderId, "recover", "step_success", {
      sweepTxId: recovery.sweepTxId,
      recoveredTrx: recovery.recoveredTrx,
      transferFeeTrx: recovery.transferFeeTrx,
    });
  }, [
    isStepManuallySkipped,
    orderId,
    patchStep,
    pollTransaction,
    refreshWalletSnapshot,
  ]);

  const runCompleteStep = useCallback(async () => {
    if (isStepManuallySkipped("complete")) {
      logCompleteOrderWorkflow(orderId, "complete", "step_manually_skipped");
      return;
    }

    logCompleteOrderWorkflow(orderId, "complete", "step_start");
    patchStep("complete", {
      state: "running",
      detail: "Creating investment and marking order successful…",
    });
    const result = await adminMarkOrderSuccess(orderId);
    if (!result.ok) {
      throw new Error(result.error.msg);
    }
    patchStep("complete", {
      state: "success",
      detail: "Order marked successful",
    });
    logCompleteOrderWorkflow(orderId, "complete", "step_success");
  }, [isStepManuallySkipped, orderId, patchStep]);

  const run = useCallback(async (): Promise<CompleteOrderRunResult> => {
    abortRef.current = false;
    setRunning(true);
    prepareRunBeforeStart();
    logCompleteOrderWorkflow(orderId, "trx", "workflow_start", { costUsdt });

    try {
      const allManual = stepsRef.current.every((step) => step.manualSkip);
      if (allManual) {
        logCompleteOrderWorkflow(orderId, "complete", "workflow_all_manual");
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

      if (isStepManuallySkipped("usdt")) {
        try {
          const recordResult = await adminRecordTrxAfterUsdt(orderId);
          if (recordResult.ok) {
            await refreshWalletSnapshot();
          }
        } catch (prepError) {
          logCompleteOrderWorkflow(orderId, "usdt", "manual_skip_prep_failed", {
            error:
              prepError instanceof Error ? prepError.message : String(prepError),
          });
        }
      }

      await runRecoverStep();
      await runCompleteStep();
      logCompleteOrderWorkflow(orderId, "complete", "workflow_success");
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
        logCompleteOrderWorkflow(orderId, "complete", "workflow_failed", {
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
    isStepManuallySkipped,
    orderId,
    prepareRunBeforeStart,
    refreshWalletSnapshot,
    runCompleteStep,
    runRecoverStep,
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
    walletSnapshot,
    retryCountdownUntil,
    manualSkipCount,
    run,
    cancel,
    resetSteps,
    applySeedFromOrder,
    toggleManualStep,
  };
}
