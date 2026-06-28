"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InvestmentReasonDetail } from "@/lib/admin/investmentReasonNotes";
import { investmentShortId } from "@/lib/admin/investmentTableIds";

const SEE_MORE_MIN_LENGTH = 72;

type Props = {
  detail: InvestmentReasonDetail | null;
  investmentId?: string;
};

export function InvestmentReasonCell({ detail, investmentId }: Props) {
  const [open, setOpen] = useState(false);

  const summary = detail?.summary ?? null;
  const unlockers = detail?.unlockers ?? [];

  if (!summary && unlockers.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const showSeeMore =
    (summary != null && summary.length > SEE_MORE_MIN_LENGTH) ||
    unlockers.length > 0;
  const shortId = investmentId ? investmentShortId(investmentId) : null;

  return (
    <>
      <div className="max-w-[200px] space-y-1">
        {summary ? (
          <p
            className="line-clamp-3 wrap-break-word text-xs leading-relaxed text-muted-foreground"
            title={showSeeMore ? undefined : summary}
          >
            {summary}
          </p>
        ) : null}
        {showSeeMore ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setOpen(true)}
          >
            See more
          </Button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="gap-2 text-left">
            <DialogTitle>
              {shortId ? `Reason — #${shortId}` : "Reason"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Full payout and unlock reason for this investment.
            </DialogDescription>
          </DialogHeader>
          {summary ? (
            <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground">
              {summary}
            </p>
          ) : null}
          {unlockers.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Unlocked by</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {unlockers.map((unlocker) => (
                  <li
                    key={unlocker.investmentId}
                    className="wrap-break-word font-mono text-xs leading-relaxed"
                  >
                    {unlocker.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
