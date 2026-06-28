"use client";

import type { ReactNode } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { AdminWorkflowStepCard } from "@/app/admin/_components/AdminWorkflowStepCard";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { AdminWorkflowStepSnapshot } from "@/lib/admin/workflowStepUi";

export function InvestmentPayoutWorkflowPanel({
  steps,
  stepOrder,
  running,
  error,
  blockClose,
  batchBanner,
  header,
  onClose,
  onCancel,
  onPrimaryAction,
  primaryDisabled = false,
  showPrimary = true,
  primaryLabel = "Start automation",
  retryLabel = "Retry",
  closeLabel = "Close",
}: {
  steps: AdminWorkflowStepSnapshot[];
  stepOrder: string[];
  running: boolean;
  error: string | null;
  blockClose: boolean;
  batchBanner?: ReactNode;
  header: ReactNode;
  onClose: () => void;
  onCancel?: () => void;
  onPrimaryAction: () => void;
  primaryDisabled?: boolean;
  showPrimary?: boolean;
  primaryLabel?: string;
  retryLabel?: string;
  closeLabel?: string;
}) {
  const stepsById = Object.fromEntries(steps.map((step) => [step.id, step]));
  const failedStepId = steps.find((step) => step.state === "failed")?.id;
  const actionLabel =
    error && !running
      ? failedStepId
        ? `Retry from ${stepsById[failedStepId]?.label ?? "failed step"}`
        : retryLabel
      : primaryLabel;

  return (
    <>
      <div className="space-y-5 p-6 pb-4">
        {batchBanner}
        {header}

        <div>
          <p className="mb-3 text-sm font-medium text-foreground">
            Automation progress
          </p>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {stepOrder.map((stepId, index) => {
              const step = stepsById[stepId];
              if (!step) {
                return null;
              }
              return (
                <AdminWorkflowStepCard
                  key={step.id}
                  step={step}
                  index={index}
                  running={running}
                />
              );
            })}
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-relaxed">{error}</span>
          </div>
        ) : null}
      </div>

      <DialogFooter className="mx-0 mb-0 border-t bg-muted/30 px-6 py-4 sm:justify-end">
        {running && onCancel ? (
          <Button
            variant="destructive"
            onClick={() => {
              onCancel();
            }}
          >
            Cancel
          </Button>
        ) : null}
        <Button variant="outline" disabled={blockClose} onClick={onClose}>
          {blockClose ? "Running…" : closeLabel}
        </Button>
        {showPrimary ? (
          error && !running ? (
            <Button
              onClick={() => {
                onPrimaryAction();
              }}
            >
              {actionLabel}
            </Button>
          ) : (
            <Button
              disabled={running || primaryDisabled || blockClose}
              onClick={() => {
                onPrimaryAction();
              }}
            >
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                primaryLabel
              )}
            </Button>
          )
        ) : null}
      </DialogFooter>
    </>
  );
}
