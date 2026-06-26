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
import { investmentShortId } from "@/lib/admin/investmentTableIds";

const SEE_MORE_MIN_LENGTH = 72;

type Props = {
  note: string | null;
  investmentId?: string;
};

export function InvestmentReasonCell({ note, investmentId }: Props) {
  const [open, setOpen] = useState(false);

  if (!note) {
    return <span className="text-muted-foreground">—</span>;
  }

  const showSeeMore = note.length > SEE_MORE_MIN_LENGTH;
  const shortId = investmentId ? investmentShortId(investmentId) : null;

  return (
    <>
      <div className="max-w-[200px] space-y-1">
        <p
          className="line-clamp-3 wrap-break-word text-xs leading-relaxed text-muted-foreground"
          title={showSeeMore ? undefined : note}
        >
          {note}
        </p>
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
          <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground">
            {note}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
