"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminBroadcastInvestmentPayout,
  adminCompleteInvestmentPayout,
  adminGetInvestmentPayoutSeed,
  adminPrepareInvestmentPayout,
  adminResetInvestmentPayoutUsdtForRetry,
  adminValidateInvestmentPayout,
} from "@/actions/admin/investmentPayout";
import { adminGetTransactionStatus } from "@/actions/admin/purchaseOrders";
import type { InvestmentPayoutMode } from "@/services/admin/investmentPayoutFulfillment";
import type { AdminWorkflowStepSnapshot } from "@/lib/admin/workflowStepUi";

export const INVESTMENT_PAYOUT_POLL_MS = 2_000;
export const INVESTMENT_PAYOUT_CHAIN_TIMEOUT_MS = 90_000;

export type InvestmentPayoutStepId =
  | "validate"
  | "prepare"
  | "broadcast"
  | "complete";

export type InvestmentPayoutStepSnapshot = AdminWorkflowStepSnapshot & {
  id: InvestmentPayoutStepId;
};

export type InvestmentPayoutSeed = {
  status: string;
  payoutFailureReason?: string | null;
  redemptionTxId?: string | null;
  redemptionTronscanUrl?: string | null;
  surplusDrawn?: boolean;
  mode?: InvestmentPayoutMode | null;
};

export type InvestmentPayoutRunResult = {
  success: boolean;
  error?: string;
  interrupted?: boolean;
};

const STEP_ORDER: InvestmentPayoutStepId[] = [
  "validate",
  "prepare",
  "broadcast",
  "complete",
];

const STEP_LABELS: Record<InvestmentPayoutStepId, string> = {
  validate: "Check eligibility",
  prepare: "Prepare payout",
  broadcast: "Send USDT",
  complete: "Complete payout",
};

function initialSteps(): InvestmentPayoutStepSnapshot[] {
  return STEP_ORDER.map((id) => ({
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

function logPayoutWorkflow(
  investmentId: string,
  stepId: InvestmentPayoutStepId,
  event: string,
  payload: Record<string, unknown> = {}
): void {
  console.log("[admin-investment-payout]", {
    investmentId,
    step: stepId,
    event,
    ...payload,
  });
}

function applySeedToSteps(
  prev: InvestmentPayoutStepSnapshot[],
  seed: InvestmentPayoutSeed
): InvestmentPayoutStepSnapshot[] {
  const successDetail = (label: string) => `${label} — already done`;

  if (seed.redemptionTxId) {
    return prev.map((step) => {
      if (step.id === "validate") {
        return {
          ...step,
          state: "success",
          detail: successDetail("Eligibility confirmed"),
        };
      }
      if (step.id === "prepare") {
        return {
          ...step,
          state: "success",
          detail: successDetail("Payout prepared"),
        };
      }
      if (step.id === "broadcast") {
        const pendingOnChain =
          seed.status === "redeeming" && !seed.payoutFailureReason;
        return {
          ...step,
          state: pendingOnChain ? "waiting_chain" : "success",
          detail: pendingOnChain
            ? "Waiting for USDT confirmation on-chain…"
            : "USDT confirmed on-chain",
          txId: seed.redemptionTxId,
          tronscanUrl:
            seed.redemptionTronscanUrl ??
            getTronscanTxUrl(seed.redemptionTxId!),
        };
      }
      return step;
    });
  }

  if (seed.status === "redeeming" && !seed.payoutFailureReason) {
    return prev.map((step) => {
      if (step.id === "validate") {
        return {
          ...step,
          state: "success",
          detail: successDetail("Eligibility confirmed"),
        };
      }
      if (step.id === "prepare") {
        return {
          ...step,
          state: "success",
          detail: successDetail("Payout prepared"),
        };
      }
      return step;
    });
  }

  if (seed.payoutFailureReason) {
    return prev.map((step) => {
      if (step.id === "broadcast") {
        return {
          ...step,
          state: "failed",
          detail: seed.payoutFailureReason ?? "Payout failed",
        };
      }
      return step;
    });
  }

  return prev;
}

export function useInvestmentPayoutWorkflow(
  investmentId: string,
  mode: InvestmentPayoutMode,
  initialSeed?: InvestmentPayoutSeed
) {
  const [steps, setSteps] = useState<InvestmentPayoutStepSnapshot[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const stepsRef = useRef(steps);
  const seedRef = useRef(initialSeed);

  seedRef.current = initialSeed;

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  const patchStep = useCallback(
    (
      id: InvestmentPayoutStepId,
      patch: Partial<Omit<InvestmentPayoutStepSnapshot, "id" | "label">>
    ) => {
      setSteps((prev) => {
        const next = prev.map((step) =>
          step.id === id ? { ...step, ...patch } : step
        );
        stepsRef.current = next;
        return next;
      });
    },
    []
  );

  const resetSteps = useCallback(() => {
    setSteps(initialSteps());
    setError(null);
  }, []);

  const applySeed = useCallback(async () => {
    const result = await adminGetInvestmentPayoutSeed(investmentId);
    if (result.ok) {
      const seed: InvestmentPayoutSeed = {
        status: result.data.status,
        payoutFailureReason: result.data.payoutFailureReason,
        redemptionTxId: result.data.redemptionTxId,
        redemptionTronscanUrl: result.data.redemptionTronscanUrl,
        surplusDrawn: result.data.surplusDrawn,
        mode: result.data.mode,
      };
      seedRef.current = seed;
      setSteps((prev) => applySeedToSteps(prev, seed));
      return;
    }

    if (seedRef.current) {
      setSteps((prev) => applySeedToSteps(prev, seedRef.current!));
    }
  }, [investmentId]);

  const prepareRunBeforeStart = useCallback(() => {
    setError(null);
    setSteps((prev) =>
      prev.map((step) => {
        if (step.state === "success") {
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
        };
      })
    );
  }, []);

  const pollTransaction = useCallback(
    async (txId: string): Promise<void> => {
      const deadline = Date.now() + INVESTMENT_PAYOUT_CHAIN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (abortRef.current) {
          throw new Error("Cancelled");
        }
        const result = await adminGetTransactionStatus(txId, true);
        if (!result.ok) {
          throw new Error(result.error.msg);
        }
        if (result.data.status === "success") {
          logPayoutWorkflow(investmentId, "broadcast", "poll_success", { txId });
          return;
        }
        if (result.data.status === "failed") {
          const message =
            result.data.message ?? "Transaction failed on-chain";
          const resetResult =
            await adminResetInvestmentPayoutUsdtForRetry(investmentId);
          if (!resetResult.ok) {
            console.warn(
              "[admin-investment-payout] reset after failed tx:",
              resetResult.error.msg
            );
          }
          logPayoutWorkflow(investmentId, "broadcast", "poll_failed", {
            txId,
            message,
          });
          patchStep("broadcast", {
            state: "failed",
            detail: message,
            txId,
            tronscanUrl: getTronscanTxUrl(txId),
          });
          throw new Error(message);
        }
        await sleep(INVESTMENT_PAYOUT_POLL_MS);
      }
      logPayoutWorkflow(investmentId, "broadcast", "poll_timeout", { txId });
      throw new Error("Timed out waiting for on-chain confirmation");
    },
    [investmentId, patchStep]
  );

  const isStepComplete = useCallback((stepId: InvestmentPayoutStepId) => {
    const step = stepsRef.current.find((s) => s.id === stepId);
    return step?.state === "success";
  }, []);

  const runValidateStep = useCallback(async () => {
    if (isStepComplete("validate")) {
      return;
    }
    logPayoutWorkflow(investmentId, "validate", "step_start", { mode });
    patchStep("validate", {
      state: "running",
      detail:
        mode === "surplus"
          ? "Checking surplus FIFO eligibility…"
          : "Checking unlock and payout readiness…",
    });
    const result = await adminValidateInvestmentPayout(investmentId, mode);
    if (!result.ok) {
      throw new Error(result.error.msg);
    }
    patchStep("validate", {
      state: "success",
      detail: "Eligible for payout",
    });
    logPayoutWorkflow(investmentId, "validate", "step_success");
  }, [investmentId, isStepComplete, mode, patchStep]);

  const runPrepareStep = useCallback(async () => {
    if (isStepComplete("prepare")) {
      return;
    }
    logPayoutWorkflow(investmentId, "prepare", "step_start", { mode });
    patchStep("prepare", {
      state: "running",
      detail:
        mode === "surplus"
          ? "Claiming investment and drawing surplus…"
          : "Claiming investment for payout…",
    });
    const result = await adminPrepareInvestmentPayout(investmentId, mode);
    if (!result.ok) {
      throw new Error(result.error.msg);
    }
    patchStep("prepare", {
      state: "success",
      detail: result.data.alreadyPrepared
        ? "Payout already prepared"
        : mode === "surplus"
          ? "Surplus drawn and payout claimed"
          : "Investment claimed for payout",
    });
    logPayoutWorkflow(investmentId, "prepare", "step_success", {
      alreadyPrepared: result.data.alreadyPrepared,
    });
  }, [investmentId, isStepComplete, mode, patchStep]);

  const runBroadcastStep = useCallback(async () => {
    if (isStepComplete("broadcast")) {
      return;
    }
    logPayoutWorkflow(investmentId, "broadcast", "step_start");
    patchStep("broadcast", {
      state: "running",
      detail: "Broadcasting USDT from treasury…",
      txId: null,
      tronscanUrl: null,
    });
    const result = await adminBroadcastInvestmentPayout(investmentId);
    if (!result.ok) {
      throw new Error(result.error.msg);
    }
    const { txId, tronscanUrl, alreadyBroadcast } = result.data;
    patchStep("broadcast", {
      state: "waiting_chain",
      detail: "Waiting for USDT confirmation on-chain…",
      txId,
      tronscanUrl,
    });
    if (alreadyBroadcast) {
      logPayoutWorkflow(investmentId, "broadcast", "step_resume_poll", { txId });
    }
    await pollTransaction(txId);
    patchStep("broadcast", {
      state: "success",
      detail: "USDT confirmed on-chain",
      txId,
      tronscanUrl,
    });
    logPayoutWorkflow(investmentId, "broadcast", "step_success", { txId });
  }, [investmentId, isStepComplete, patchStep, pollTransaction]);

  const runCompleteStep = useCallback(async () => {
    if (isStepComplete("complete")) {
      return;
    }
    logPayoutWorkflow(investmentId, "complete", "step_start");
    patchStep("complete", {
      state: "running",
      detail: "Confirming payout and updating ledger…",
    });
    const result = await adminCompleteInvestmentPayout(investmentId);
    if (!result.ok) {
      throw new Error(result.error.msg);
    }
    patchStep("complete", {
      state: "success",
      detail: "Investment marked redeemed",
    });
    logPayoutWorkflow(investmentId, "complete", "step_success");
  }, [investmentId, isStepComplete, patchStep]);

  const run = useCallback(async (): Promise<InvestmentPayoutRunResult> => {
    abortRef.current = false;
    setRunning(true);
    prepareRunBeforeStart();
    logPayoutWorkflow(investmentId, "validate", "workflow_start", { mode });

    try {
      await runValidateStep();
      await runPrepareStep();
      await runBroadcastStep();
      await runCompleteStep();
      logPayoutWorkflow(investmentId, "complete", "workflow_success");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const hasFailedStep = stepsRef.current.some((step) => step.state === "failed");
      const hasInFlightStep = stepsRef.current.some(
        (step) => step.state === "waiting_chain" || step.state === "running"
      );
      const interrupted =
        message === "Cancelled" ||
        (hasInFlightStep &&
          !hasFailedStep &&
          message !== "Timed out waiting for on-chain confirmation");
      if (message !== "Cancelled") {
        setError(message);
        logPayoutWorkflow(investmentId, "complete", "workflow_failed", {
          error: message,
        });
        if (
          message !== "Timed out waiting for on-chain confirmation" &&
          stepsRef.current.some((step) => step.id === "broadcast" && step.state === "failed")
        ) {
          void applySeed();
        }
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
    investmentId,
    mode,
    prepareRunBeforeStart,
    runBroadcastStep,
    runCompleteStep,
    runPrepareStep,
    runValidateStep,
    applySeed,
  ]);

  const cancel = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    steps,
    running,
    error,
    run,
    cancel,
    resetSteps,
    applySeed,
  };
}
