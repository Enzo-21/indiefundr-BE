"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import type { AutopilotPayoutCandidate } from "./usePayoutAutopilot";

function modeLabel(mode: AutopilotPayoutCandidate["mode"]): string {
  return mode === "surplus" ? "Surplus FIFO" : "Normal unlock";
}

function modeTitle(mode: AutopilotPayoutCandidate["mode"]): string {
  return mode === "surplus" ? "Surplus payout" : "Normal payout";
}

export function PayoutAutopilotCountdownPanel({
  completedCount,
  initialTotal,
  nextIndex,
  countdownSecondsLeft,
  pendingCandidate,
  onStop,
}: {
  completedCount: number;
  initialTotal: number;
  nextIndex: number;
  countdownSecondsLeft: number;
  pendingCandidate: AutopilotPayoutCandidate;
  onStop: () => void;
}) {
  return (
    <>
      <div className="space-y-5 p-6 pb-4">
        <DialogHeader className="gap-3 text-left">
          <DialogTitle className="text-xl">Payout autopilot</DialogTitle>
          <DialogDescription className="text-base leading-relaxed">
            Pausing between payouts. The next automation starts automatically
            when the countdown reaches zero.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Payout {completedCount} of {initialTotal} complete
          </p>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            Starting payout {nextIndex} of {initialTotal} in{" "}
            <span className="text-2xl font-bold tabular-nums">
              {countdownSecondsLeft}
            </span>
            …
          </p>
        </div>

        <div className="rounded-xl border bg-muted/20 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Up next
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {modeTitle(pendingCandidate.mode)} · {pendingCandidate.userEmail}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {formatUsdtDisplay(pendingCandidate.projectedPayoutUsdt)} USDT
            </span>
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
              {modeLabel(pendingCandidate.mode)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Waiting before next payout…</span>
        </div>
      </div>

      <DialogFooter className="mx-0 mb-0 border-t bg-muted/30 px-6 py-4 sm:justify-end">
        <Button variant="destructive" onClick={onStop}>
          Stop autopilot
        </Button>
      </DialogFooter>
    </>
  );
}
