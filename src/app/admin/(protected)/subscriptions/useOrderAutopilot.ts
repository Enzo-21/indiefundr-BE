"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminGetAutopilotOrderCandidates,
  adminMarkOrderAutopilotManualCheck,
} from "@/actions/admin/purchaseOrders";
import { adminMarkReferralAutopilotManualCheck } from "@/actions/admin/referralPayoutOrders";
import { adminMarkWithdrawalAutopilotManualCheck } from "@/actions/admin/withdrawals";
import type { AutopilotOrderCandidate } from "@/services/admin/orderAutopilot";
import {
  advanceAutopilotBatchQueue,
  type AutopilotManualCheckItem,
  isAutopilotNonTerminalFailure,
} from "@/lib/admin/autopilotBatch";
import type { AutopilotCountdownTone } from "@/lib/admin/autopilotCountdownTone";
import { AUTOPILOT_INTER_PAYOUT_DELAY_SEC } from "@/lib/config/adminAutopilot";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";

export type { AutopilotOrderCandidate };

export type OrderAutopilotPhase =
  | "configure"
  | "running"
  | "countdown"
  | "summary";

function manualCheckDetail(candidate: AutopilotOrderCandidate): string {
  const amount = `${formatUsdtDisplay(candidate.costUsdt)} USDT`;
  if (candidate.orderType === "withdraw") {
    const dest = candidate.destinationLabel ?? "destination";
    return `Withdrawal · ${dest} · ${amount}`;
  }
  if (candidate.orderType === "referral") {
    const kind = candidate.kindLabel ?? "Referral payout";
    return `Referral · ${kind} · ${amount}`;
  }
  return `Investment · ${candidate.fundName} · ${amount}`;
}

export function useOrderAutopilot() {
  const router = useRouter();
  const [phase, setPhase] = useState<OrderAutopilotPhase>("configure");
  const [includeInvestment, setIncludeInvestment] = useState(true);
  const [includeWithdrawal, setIncludeWithdrawal] = useState(true);
  const [includeReferral, setIncludeReferral] = useState(true);
  const [batchQueue, setBatchQueue] = useState<AutopilotOrderCandidate[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [initialTotal, setInitialTotal] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [manualCheckItems, setManualCheckItems] = useState<
    AutopilotManualCheckItem[]
  >([]);
  const [currentCandidate, setCurrentCandidate] =
    useState<AutopilotOrderCandidate | null>(null);
  const [pendingCandidate, setPendingCandidate] =
    useState<AutopilotOrderCandidate | null>(null);
  const [countdownSecondsLeft, setCountdownSecondsLeft] = useState(0);
  const [interItemOutcome, setInterItemOutcome] =
    useState<AutopilotCountdownTone | null>(null);
  const [configureError, setConfigureError] = useState<string | null>(null);
  const modesRef = useRef({
    includeInvestment: true,
    includeWithdrawal: true,
    includeReferral: true,
  });
  const abortRef = useRef(false);
  const pendingCandidateRef = useRef<AutopilotOrderCandidate | null>(null);
  const manualCheckItemsRef = useRef<AutopilotManualCheckItem[]>([]);
  const completedCountRef = useRef(0);
  const queueIndexRef = useRef(0);
  const batchQueueRef = useRef<AutopilotOrderCandidate[]>([]);

  modesRef.current = { includeInvestment, includeWithdrawal, includeReferral };
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

  const fetchCandidates = useCallback(async () => {
    const modes = modesRef.current;
    const result = await adminGetAutopilotOrderCandidates(modes);
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
        const message = "No pending orders in the selected queues.";
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
  }, [fetchCandidates]);

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
        throw new Error("No order candidate to mark for manual check");
      }

      const markResult =
        candidate.orderType === "withdraw"
          ? await adminMarkWithdrawalAutopilotManualCheck(
              candidate.orderId,
              error
            )
          : candidate.orderType === "referral"
            ? await adminMarkReferralAutopilotManualCheck(
                candidate.orderId,
                error
              )
            : await adminMarkOrderAutopilotManualCheck(candidate.orderId, error);
      if (!markResult.ok) {
        throw new Error(markResult.error.msg);
      }

      const manualCheckEntry: AutopilotManualCheckItem = {
        key: `${candidate.orderType}:${candidate.orderId}`,
        label: candidate.userEmail,
        detail: manualCheckDetail(candidate),
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
    (nextCandidate: AutopilotOrderCandidate, outcome: AutopilotCountdownTone) => {
      abortRef.current = false;
      setPendingCandidate(nextCandidate);
      setInterItemOutcome(outcome);
      setCountdownSecondsLeft(AUTOPILOT_INTER_PAYOUT_DELAY_SEC);
      setPhase("countdown");
    },
    []
  );

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

  return {
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
    interItemOutcome,
    configureError,
    startBatch,
    advanceAfterSuccess,
    advanceAfterFailure,
    beginCountdown,
    stopAutopilot,
    resetToConfigure,
  };
}
