"use client";

import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AutopilotManualCheckItem } from "@/lib/admin/autopilotBatch";

export function AutopilotBatchSummaryPanel({
  title,
  itemLabel,
  completedCount,
  manualCheckItems,
  onClose,
}: {
  title: string;
  itemLabel: string;
  completedCount: number;
  manualCheckItems: AutopilotManualCheckItem[];
  onClose: () => void;
}) {
  const manualCheckCount = manualCheckItems.length;
  const allSucceeded = manualCheckCount === 0 && completedCount > 0;

  return (
    <>
      <div className="space-y-5 p-6 pb-4">
        <DialogHeader className="gap-3 text-left">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="text-base leading-relaxed">
            Autopilot finished processing the batch you started.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 px-4 py-4">
          <p className="text-sm font-medium text-foreground">
            {completedCount}{" "}
            {itemLabel}
            {completedCount === 1 ? "" : "s"} completed
            {manualCheckCount > 0 ? (
              <>
                {" "}
                · {manualCheckCount} require
                {manualCheckCount === 1 ? "s" : ""} manual check
              </>
            ) : null}
          </p>
          {allSucceeded ? (
            <div className="mt-3 flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Every item in this batch completed successfully.</span>
            </div>
          ) : null}
        </div>

        {manualCheckCount > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              Requires manual check
            </p>
            <div className="space-y-2">
              {manualCheckItems.map((item) => (
                <div
                  key={item.key}
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"
                >
                  <div className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.detail}
                      </p>
                      <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">
                        {item.error}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <DialogFooter className="mx-0 mb-0 border-t bg-muted/30 px-6 py-4 sm:justify-end">
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  );
}
