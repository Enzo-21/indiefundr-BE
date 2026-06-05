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
            const { updated, adjustedFields } = result.data;
            if (updated) {
              toast.success(
                `Ledger reconciled (${adjustedFields.join(", ") || "fields updated"})`
              );
            } else {
              toast.success("Ledger already matches expected values");
            }
          } else {
            toast.error(result.error.msg);
          }
        });
      }}
    >
      {pending ? "Running…" : "Reconcile treasury"}
    </Button>
  );
}
