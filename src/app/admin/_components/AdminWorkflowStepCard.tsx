"use client";

import Link from "next/link";
import { Check, Circle, ExternalLink, Loader2, X } from "lucide-react";
import {
  stepBoxClass,
  stepStatusBadgeClass,
  stepStatusLabel,
  type AdminWorkflowStepSnapshot,
  type AdminWorkflowStepState,
} from "@/lib/admin/workflowStepUi";
import { cn } from "@/lib/utils";

function stepIcon(state: AdminWorkflowStepState, manualSkip?: boolean) {
  if (manualSkip && state === "skipped") {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/15">
        <Check className="h-4 w-4 text-sky-700" />
      </span>
    );
  }
  switch (state) {
    case "success":
    case "skipped":
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="h-4 w-4 text-emerald-600" />
        </span>
      );
    case "failed":
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/15">
          <X className="h-4 w-4 text-destructive" />
        </span>
      );
    case "running":
    case "waiting_chain":
    case "retry_wait":
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </span>
      );
    default:
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <Circle className="h-4 w-4 text-muted-foreground" />
        </span>
      );
  }
}

export function AdminWorkflowStepCard({
  step,
  index,
  running,
  onToggleManualSkip,
}: {
  step: AdminWorkflowStepSnapshot;
  index: number;
  running: boolean;
  onToggleManualSkip?: (stepId: string) => void;
}) {
  const toggleable = !running && Boolean(onToggleManualSkip);
  const hintText = toggleable
    ? step.manualSkip
      ? "Click to unmark"
      : "Click to mark as done"
    : null;

  return (
    <div
      role={toggleable ? "button" : undefined}
      tabIndex={toggleable ? 0 : undefined}
      onClick={
        toggleable
          ? () => {
              onToggleManualSkip?.(step.id);
            }
          : undefined
      }
      onKeyDown={
        toggleable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggleManualSkip?.(step.id);
              }
            }
          : undefined
      }
      className={cn(
        "flex min-h-[120px] min-w-0 flex-1 flex-col rounded-xl border p-4 transition-colors",
        stepBoxClass(step.state, step.manualSkip, toggleable)
      )}
    >
      <div className="flex items-start gap-3">
        {stepIcon(step.state, step.manualSkip)}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {index + 1}. {step.label}
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                stepStatusBadgeClass(step.state, step.manualSkip)
              )}
            >
              {stepStatusLabel(step.state, step.manualSkip)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {step.detail || "Waiting to start…"}
          </p>
          {hintText ? (
            <p className="mt-1 text-xs font-medium text-muted-foreground/80">
              {hintText}
            </p>
          ) : null}
          {step.tronscanUrl && step.txId ? (
            <Link
              href={step.tronscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View on Tronscan
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
