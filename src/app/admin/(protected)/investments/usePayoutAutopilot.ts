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
import type { AutopilotCountdownTone } from "@/lib/admin/autopilotCountdownTone";
import {
  clearPayoutAutopilotStorage,
  readPayoutAutopilotStorage,
  writePayoutAutopilotStorage,
  type PayoutAutopilotModes,
} from "@/lib/admin/payoutAutopilotStorage";
import {
  AUTOPILOT_INTER_PAYOUT_DELAY_SEC,
  AUTOPILOT_LOOP_DELAY_SEC,
} from "@/lib/config/adminAutopilot";
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
  | "loop_pause"
  | "resume_grace"
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
  const [continuousEnabled, setContinuousEnabled] = useState(false);
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
  const [loopSecondsLeft, setLoopSecondsLeft] = useState(0);
  const [interItemOutcome, setInterItemOutcome] =
    useState<AutopilotCountdownTone | null>(null);
  const [configureError, setConfigureError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const modesRef = useRef({ includeNormal: true, includeSurplus: true });
  const abortRef = useRef(false);
  const continuousRef = useRef(false);
  const pendingCandidateRef = useRef<AutopilotPayoutCandidate | null>(null);
  const manualCheckItemsRef = useRef<AutopilotManualCheckItem[]>([]);
  const completedCountRef = useRef(0);
  const queueIndexRef = useRef(0);
  const batchQueueRef = useRef<AutopilotPayoutCandidate[]>([]);
  const startBatchRef = useRef<
    (() => Promise<{ ok: true } | { ok: false; error: string }>) | null
  >(null);

  modesRef.current = { includeNormal, includeSurplus };
  continuousRef.current = continuousEnabled;
  pendingCandidateRef.current = pendingCandidate;
  manualCheckItemsRef.current = manualCheckItems;
  completedCountRef.current = completedCount;
  queueIndexRef.current = queueIndex;
  batchQueueRef.current = batchQueue;

  const applyModes = useCallback((modes: PayoutAutopilotModes) => {
    setIncludeNormal(modes.includeNormal);
    setIncludeSurplus(modes.includeSurplus);
    modesRef.current = modes;
  }, []);

  const clearCountdown = useCallback(() => {
    abortRef.current = true;
    setCountdownSecondsLeft(0);
    setLoopSecondsLeft(0);
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
    setInterItemOutcome(null);
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
    setInterItemOutcome(null);
    setConfigureError(null);
    return { completedCount: stoppedAfter, manualCheckCount };
  }, [clearCountdown]);

  const stopContinuous = useCallback(() => {
    clearPayoutAutopilotStorage();
    setContinuousEnabled(false);
    continuousRef.current = false;
    return stopAutopilot();
  }, [stopAutopilot]);

  const fetchCandidates = useCallback(async () => {
    const modes = modesRef.current;
    const result = await adminGetAutopilotPayoutCandidates(modes);
    if (!result.ok) {
      throw new Error(result.error.msg);
    }
    return result.data;
  }, []);

  const beginLoopPause = useCallback(() => {
    abortRef.current = false;
    setCurrentCandidate(null);
    setPendingCandidate(null);
    setInterItemOutcome(null);
    setLoopSecondsLeft(AUTOPILOT_LOOP_DELAY_SEC);
    setPhase("loop_pause");
  }, []);

  const finishBatch = useCallback(
    (completed: number, manualChecks: AutopilotManualCheckItem[]) => {
      setCurrentCandidate(null);
      setPendingCandidate(null);
      if (continuousRef.current) {
        beginLoopPause();
        return {
          done: true as const,
          completedCount: completed,
          manualCheckItems: manualChecks,
        };
      }
      setPhase("summary");
      return {
        done: true as const,
        completedCount: completed,
        manualCheckItems: manualChecks,
      };
    },
    [beginLoopPause]
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
    abortRef.current = false;
    setConfigureError(null);
    setCompletedCount(0);
    setManualCheckItems([]);
    setPendingCandidate(null);
    setCountdownSecondsLeft(0);
    setLoopSecondsLeft(0);
    setQueueIndex(0);

    try {
      const candidates = await fetchCandidates();
      if (candidates.length === 0) {
        if (continuousRef.current) {
          beginLoopPause();
          return { ok: true };
        }
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
      if (continuousRef.current) {
        beginLoopPause();
        return { ok: true };
      }
      setConfigureError(message);
      return { ok: false, error: message };
    }
  }, [beginLoopPause, fetchCandidates]);

  startBatchRef.current = startBatch;

  const enableContinuousAndStart = useCallback(async () => {
    const modes = modesRef.current;
    writePayoutAutopilotStorage(modes);
    setContinuousEnabled(true);
    continuousRef.current = true;
    return startBatch();
  }, [startBatch]);

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
        seedResult.data.status === "redeeming" &&
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

  const beginCountdown = useCallback(
    (nextCandidate: AutopilotPayoutCandidate, outcome: AutopilotCountdownTone) => {
      abortRef.current = false;
      setPendingCandidate(nextCandidate);
      setInterItemOutcome(outcome);
      setCountdownSecondsLeft(AUTOPILOT_INTER_PAYOUT_DELAY_SEC);
      setPhase("countdown");
    },
    []
  );

  // Hydrate continuous mode from localStorage once on mount.
  useEffect(() => {
    const stored = readPayoutAutopilotStorage();
    if (!stored) {
      setHydrated(true);
      return;
    }
    applyModes(stored.modes);
    setContinuousEnabled(true);
    continuousRef.current = true;
    abortRef.current = false;
    setLoopSecondsLeft(AUTOPILOT_LOOP_DELAY_SEC);
    setPhase("resume_grace");
    setHydrated(true);
  }, [applyModes]);

  // Inter-item countdown.
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
      setInterItemOutcome(null);
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

  // Loop pause → reload; resume grace → start next batch.
  useEffect(() => {
    if (phase !== "loop_pause" && phase !== "resume_grace") {
      return;
    }

    if (loopSecondsLeft <= 0) {
      if (abortRef.current) {
        return;
      }
      if (phase === "loop_pause") {
        window.location.reload();
        return;
      }
      void startBatchRef.current?.();
      return;
    }

    const timer = setTimeout(() => {
      if (abortRef.current) {
        return;
      }
      setLoopSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [phase, loopSecondsLeft]);

  return {
    phase,
    continuousEnabled,
    hydrated,
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
    loopSecondsLeft,
    interItemOutcome,
    configureError,
    startBatch,
    enableContinuousAndStart,
    advanceAfterSuccess,
    advanceAfterFailure,
    beginCountdown,
    stopAutopilot,
    stopContinuous,
    resetToConfigure,
  };
}
