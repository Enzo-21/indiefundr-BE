"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/actions/_lib/actionResult";
import type { EvaluateTreasuryResult } from "@/actions/treasury/evaluate";

export function EvaluateButton({
  action,
}: {
  action: () => Promise<ActionResult<EvaluateTreasuryResult>>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await action();
          if (result.ok) {
            const { updated, headId } = result.data;
            toast.success(
              headId
                ? `Queue evaluated (${updated} slot${updated === 1 ? "" : "s"}); head ${headId.slice(-6)}`
                : `Queue evaluated (${updated} matured investment${updated === 1 ? "" : "s"})`
            );
          } else {
            toast.error(result.error.msg);
          }
        });
      }}
    >
      {pending ? "Running…" : "Evaluate payout queue"}
    </Button>
  );
}
