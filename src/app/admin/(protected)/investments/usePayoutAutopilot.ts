"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminGetAutopilotPayoutCandidates,
  adminGetInvestmentPayoutSeed,
  adminMarkInvestmentAutopilotManualCheck,
} from "@/actions/admin/investmentPayout";
import {
  advanceAutopilotBatchQueue,
  type AutopilotManualCheckItem,
  isAutopilotNonTerminalFailure,
} from "@/lib/admin/autopilotBatch";
import { InvestmentStatus } from "@prisma/client";
import { AUTOPILOT_INTER_PAYOUT_DELAY_SEC } from "@/lib/config/adminAutopilot";
import type { InvestmentPayoutMode } from "@/services/admin/investmentPayoutFulfillment";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";

export type AutopilotPayoutCandidate = {
  investmentId: string;
  userEmail: string;
  projectedPayoutUsdt: number;
  mode: InvestmentPayoutMode;
  subscribedAtIso: string | null;
};

export type PayoutAutopilotPhase =
  | "configure"
  | "running"
  | "countdown"
  | "summary";

function payoutCandidateKey(candidate: AutopilotPayoutCandidate): string {
  return `${candidate.investmentId}:${candidate.mode}`;
}

function payoutModeLabel(mode: InvestmentPayoutMode): string {
  return mode === "surplus" ? "Surplus FIFO" : "Normal unlock";
}

export function usePayoutAutopilot() {
  const router = useRouter();
  const [phase, setPhase] = useState<PayoutAutopilotPhase>("configure");
  const [includeNormal, setIncludeNormal] = useState(true);
  const [includeSurplus, setIncludeSurplus] = useState(true);
  const [batchQueue, setBatchQueue] = useState<AutopilotPayoutCandidate[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [initialTotal, setInitialTotal] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [manualCheckItems, setManualCheckItems] = useState<
    AutopilotManualCheckItem[]
  >([]);
  const [currentCandidate, setCurrentCandidate] =
    useState<AutopilotPayoutCandidate | null>(null);
  const [pendingCandidate, setPendingCandidate] =
    useState<AutopilotPayoutCandidate | null>(null);
  const [countdownSecondsLeft, setCountdownSecondsLeft] = useState(0);
  const [configureError, setConfigureError] = useState<string | null>(null);
  const modesRef = useRef({ includeNormal: true, includeSurplus: true });
  const abortRef = useRef(false);
  const pendingCandidateRef = useRef<AutopilotPayoutCandidate | null>(null);
  const manualCheckItemsRef = useRef<AutopilotManualCheckItem[]>([]);
  const completedCountRef = useRef(0);
  const queueIndexRef = useRef(0);
  const batchQueueRef = useRef<AutopilotPayoutCandidate[]>([]);

  pendingCandidateRef.current = pendingCandidate;
  manualCheckItemsRef.current = manualCheckItems;
  completedCountRef.current = completedCount;
  queueIndexRef.current = queueIndex;
  batchQueueRef.current = batchQueue;

  const clearCountdown = useCallback(() => {
    abortRef.current = true;
    setCountdownSecondsLeft(0);
    setPendingCandidate(null);
  }, []);

  const resetToConfigure = useCallback(() => {
    clearCountdown();
    setPhase("configure");
    setBatchQueue([]);
    setQueueIndex(0);
    setInitialTotal(0);
    setCompletedCount(0);
    setManualCheckItems([]);
    setCurrentCandidate(null);
    setConfigureError(null);
  }, [clearCountdown]);

  const stopAutopilot = useCallback(() => {
    const stoppedAfter = completedCountRef.current;
    const manualCheckCount = manualCheckItemsRef.current.length;
    clearCountdown();
    setPhase("configure");
    setBatchQueue([]);
    setQueueIndex(0);
    setInitialTotal(0);
    setCompletedCount(0);
    setManualCheckItems([]);
    setCurrentCandidate(null);
    setPendingCandidate(null);
    setConfigureError(null);
    return { completedCount: stoppedAfter, manualCheckCount };
  }, [clearCountdown]);

  const fetchCandidates = useCallback(async () => {
    const modes = modesRef.current;
    const result = await adminGetAutopilotPayoutCandidates(modes);
    if (!result.ok) {
      throw new Error(result.error.msg);
    }
    return result.data;
  }, []);

  const finishBatch = useCallback(
    (completed: number, manualChecks: AutopilotManualCheckItem[]) => {
      setPhase("summary");
      setCurrentCandidate(null);
      setPendingCandidate(null);
      return {
        done: true as const,
        completedCount: completed,
        manualCheckItems: manualChecks,
      };
    },
    []
  );

  const advanceQueue = useCallback(
    (completed: number, manualChecks: AutopilotManualCheckItem[]) => {
      const outcome = advanceAutopilotBatchQueue(
        batchQueueRef.current,
        queueIndexRef.current,
        completed,
        manualChecks
      );
      setQueueIndex((index) => index + 1);
      router.refresh();
      if (outcome.done) {
        return finishBatch(outcome.completedCount, outcome.manualCheckItems);
      }
      return {
        done: false as const,
        completedCount: outcome.completedCount,
        manualCheckItems: outcome.manualCheckItems,
        nextCandidate: outcome.nextCandidate,
      };
    },
    [finishBatch, router]
  );

  const startBatch = useCallback(async (): Promise<
    { ok: true } | { ok: false; error: string }
  > => {
    modesRef.current = { includeNormal, includeSurplus };
    abortRef.current = false;
    setConfigureError(null);
    setCompletedCount(0);
    setManualCheckItems([]);
    setPendingCandidate(null);
    setCountdownSecondsLeft(0);
    setQueueIndex(0);

    try {
      const candidates = await fetchCandidates();
      if (candidates.length === 0) {
        const message = "No eligible payouts for the selected modes.";
        setConfigureError(message);
        return { ok: false, error: message };
      }
      setBatchQueue(candidates);
      setInitialTotal(candidates.length);
      setCurrentCandidate(candidates[0] ?? null);
      setPhase("running");
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setConfigureError(message);
      return { ok: false, error: message };
    }
  }, [fetchCandidates, includeNormal, includeSurplus]);

  const advanceAfterSuccess = useCallback(async () => {
    const nextCompleted = completedCountRef.current + 1;
    setCompletedCount(nextCompleted);
    setCurrentCandidate(null);
    return advanceQueue(nextCompleted, manualCheckItemsRef.current);
  }, [advanceQueue]);

  const advanceAfterFailure = useCallback(
    async (error: string) => {
      if (isAutopilotNonTerminalFailure(error)) {
        return null;
      }

      const candidate = batchQueueRef.current[queueIndexRef.current];
      if (!candidate) {
        throw new Error("No payout candidate to mark for manual check");
      }

      const seedResult = await adminGetInvestmentPayoutSeed(candidate.investmentId);
      if (
        seedResult.ok &&
        seedResult.data.status === InvestmentStatus.redeeming &&
        seedResult.data.redemptionTxId
      ) {
        return null;
      }

      const markResult = await adminMarkInvestmentAutopilotManualCheck(
        candidate.investmentId,
        error
      );
      if (!markResult.ok) {
        throw new Error(markResult.error.msg);
      }

      const manualCheckEntry: AutopilotManualCheckItem = {
        key: payoutCandidateKey(candidate),
        label: candidate.userEmail,
        detail: `${payoutModeLabel(candidate.mode)} · ${formatUsdtDisplay(candidate.projectedPayoutUsdt)} USDT`,
        error,
      };
      const nextManualChecks = [...manualCheckItemsRef.current, manualCheckEntry];
      setManualCheckItems(nextManualChecks);
      setCurrentCandidate(null);
      return advanceQueue(completedCountRef.current, nextManualChecks);
    },
    [advanceQueue]
  );

  const beginCountdown = useCallback((nextCandidate: AutopilotPayoutCandidate) => {
    abortRef.current = false;
    setPendingCandidate(nextCandidate);
    setCountdownSecondsLeft(AUTOPILOT_INTER_PAYOUT_DELAY_SEC);
    setPhase("countdown");
  }, []);

  useEffect(() => {
    if (phase !== "countdown" || !pendingCandidate) {
      return;
    }

    if (countdownSecondsLeft <= 0) {
      const next = pendingCandidateRef.current;
      if (!next || abortRef.current) {
        return;
      }
      setCurrentCandidate(next);
      setPendingCandidate(null);
      setPhase("running");
      return;
    }

    const timer = setTimeout(() => {
      if (abortRef.current) {
        return;
      }
      setCountdownSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [phase, pendingCandidate, countdownSecondsLeft]);

  useEffect(() => {
    modesRef.current = { includeNormal, includeSurplus };
  }, [includeNormal, includeSurplus]);

  return {
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
  };
}
