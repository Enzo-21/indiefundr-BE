import { cn } from "@/lib/utils";

export type AdminWorkflowStepState =
  | "idle"
  | "running"
  | "waiting_chain"
  | "success"
  | "failed"
  | "skipped"
  | "retry_wait";

export type AdminWorkflowStepSnapshot = {
  id: string;
  label: string;
  state: AdminWorkflowStepState;
  detail: string;
  txId?: string | null;
  tronscanUrl?: string | null;
  manualSkip?: boolean;
};

export function stepStatusLabel(
  state: AdminWorkflowStepState,
  manualSkip?: boolean
): string {
  if (manualSkip && state === "skipped") {
    return "Manual";
  }
  switch (state) {
    case "success":
      return "Done";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Failed";
    case "running":
      return "Running";
    case "waiting_chain":
      return "Confirming";
    case "retry_wait":
      return "Retry wait";
    default:
      return "Pending";
  }
}

export function stepStatusBadgeClass(
  state: AdminWorkflowStepState,
  manualSkip?: boolean
): string {
  if (manualSkip && state === "skipped") {
    return "bg-sky-500/15 text-sky-800";
  }
  switch (state) {
    case "success":
    case "skipped":
      return "bg-emerald-500/15 text-emerald-700";
    case "failed":
      return "bg-destructive/15 text-destructive";
    case "running":
    case "waiting_chain":
    case "retry_wait":
      return "bg-primary/15 text-primary";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function stepBoxClass(
  state: AdminWorkflowStepState,
  manualSkip?: boolean,
  toggleable?: boolean
): string {
  if (manualSkip && state === "skipped") {
    return cn(
      "border-sky-500/50 border-dashed bg-sky-500/5 shadow-sm",
      toggleable && "cursor-pointer hover:bg-sky-500/10"
    );
  }
  switch (state) {
    case "success":
    case "skipped":
      return "border-emerald-500/50 bg-emerald-500/5 shadow-sm";
    case "failed":
      return "border-destructive/50 bg-destructive/5 shadow-sm";
    case "running":
    case "waiting_chain":
    case "retry_wait":
      return "border-primary/50 bg-primary/5 shadow-sm";
    default:
      return cn(
        "border-border/80 bg-muted/30",
        toggleable && "cursor-pointer border-dashed hover:bg-muted/50"
      );
  }
}

const IN_FLIGHT_WORKFLOW_STEP_STATES: AdminWorkflowStepState[] = [
  "running",
  "waiting_chain",
  "retry_wait",
];

export function isAdminWorkflowDismissBlocked(options: {
  running?: boolean;
  retryCountdownUntil?: Date | null;
  steps?: Pick<AdminWorkflowStepSnapshot, "state">[];
}): boolean {
  if (options.running) {
    return true;
  }
  if (options.retryCountdownUntil) {
    return true;
  }
  return (
    options.steps?.some((step) =>
      IN_FLIGHT_WORKFLOW_STEP_STATES.includes(step.state)
    ) ?? false
  );
}
