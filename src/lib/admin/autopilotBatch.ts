export type AutopilotManualCheckItem = {
  key: string;
  label: string;
  detail: string;
  error: string;
};

export type AutopilotBatchAdvanceResult<T> =
  | {
      done: true;
      completedCount: number;
      manualCheckItems: AutopilotManualCheckItem[];
    }
  | {
      done: false;
      nextCandidate: T;
      completedCount: number;
      manualCheckItems: AutopilotManualCheckItem[];
    };

export function advanceAutopilotBatchQueue<T>(
  batchQueue: T[],
  queueIndex: number,
  completedCount: number,
  manualCheckItems: AutopilotManualCheckItem[]
): AutopilotBatchAdvanceResult<T> {
  const nextIndex = queueIndex + 1;
  if (nextIndex >= batchQueue.length) {
    return { done: true, completedCount, manualCheckItems };
  }
  return {
    done: false,
    nextCandidate: batchQueue[nextIndex] as T,
    completedCount,
    manualCheckItems,
  };
}

export function formatOrderAutopilotManualCheckNote(
  error: string,
  at: Date = new Date()
): string {
  const date = at.toISOString().slice(0, 10);
  return `[Autopilot ${date}] Manual check needed — ${error}`;
}

export function formatInvestmentAutopilotManualCheckReason(error: string): string {
  return `Autopilot: manual check needed — ${error}`;
}

export function appendAutopilotNote(
  existing: string | null | undefined,
  line: string
): string {
  const trimmed = existing?.trim();
  return trimmed ? `${trimmed}\n${line}` : line;
}

export function buildAutopilotStopToastMessage(options: {
  itemLabel: string;
  completedCount: number;
  manualCheckCount: number;
}): string {
  const { itemLabel, completedCount, manualCheckCount } = options;
  const parts: string[] = [];
  if (completedCount > 0) {
    parts.push(
      `${completedCount} ${itemLabel}${completedCount === 1 ? "" : "s"} completed`
    );
  }
  if (manualCheckCount > 0) {
    parts.push(
      `${manualCheckCount} require${manualCheckCount === 1 ? "s" : ""} manual check`
    );
  }
  if (parts.length === 0) {
    return "Autopilot stopped";
  }
  return `Autopilot stopped — ${parts.join(", ")}`;
}

export function buildAutopilotCompleteToastMessage(options: {
  itemLabel: string;
  completedCount: number;
  manualCheckCount: number;
}): string {
  const { itemLabel, completedCount, manualCheckCount } = options;
  if (manualCheckCount === 0) {
    return `Autopilot completed ${completedCount} ${itemLabel}${completedCount === 1 ? "" : "s"}`;
  }
  if (completedCount === 0) {
    return `Autopilot finished — ${manualCheckCount} ${itemLabel}${manualCheckCount === 1 ? "" : "s"} require manual check`;
  }
  return `Autopilot finished — ${completedCount} ${itemLabel}${completedCount === 1 ? "" : "s"} completed, ${manualCheckCount} require manual check`;
}

export type AutopilotWorkflowStepSnapshot = {
  state: string;
};

export type AutopilotWorkflowRunOutcome = {
  success: boolean;
  error?: string;
  interrupted?: boolean;
};

export function isAutopilotWorkflowInterruptedFailure(
  result: AutopilotWorkflowRunOutcome,
  steps: AutopilotWorkflowStepSnapshot[]
): boolean {
  if (result.success) {
    return false;
  }
  if (result.interrupted === true) {
    return true;
  }
  if (result.error === "Cancelled") {
    return true;
  }
  if (steps.some((step) => step.state === "failed")) {
    return false;
  }
  if (result.error === "Timed out waiting for on-chain confirmation") {
    return false;
  }
  return steps.some(
    (step) =>
      step.state === "waiting_chain" ||
      step.state === "running" ||
      step.state === "retry_wait"
  );
}

export function isAutopilotNonTerminalFailure(error: string): boolean {
  return error === "Cancelled";
}
