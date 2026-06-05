"use client";

import { investmentShortId } from "@/lib/admin/investmentTableIds";
import { cn } from "@/lib/utils";
import { scrollToInvestmentRow } from "./investmentTableScroll";

export function PayoutRowTargetIdLink({
  investmentId,
  className,
}: {
  investmentId: string;
  className?: string;
}) {
  const shortId = investmentShortId(investmentId);

  return (
    <button
      type="button"
      title={`Go to subscription row (${shortId})`}
      className={cn(
        "cursor-pointer rounded-md border border-primary/35 bg-primary/12 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary",
        "shadow-sm transition-colors hover:bg-primary/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      onClick={() => scrollToInvestmentRow(investmentId, "subscription")}
    >
      {shortId}
    </button>
  );
}
