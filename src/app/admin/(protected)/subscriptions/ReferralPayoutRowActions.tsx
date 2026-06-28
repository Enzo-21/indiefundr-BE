"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adminMarkReferralPayoutFailed } from "@/actions/admin/referralPayoutOrders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminReferralPayoutRow } from "@/services/admin/referralPayoutOrderFulfillment";
import { CompleteReferralPayoutDialog } from "./CompleteReferralPayoutDialog";

export function ReferralPayoutRowActions({ row }: { row: AdminReferralPayoutRow }) {
  const [failReason, setFailReason] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: { msg: string } }>) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success("Saved");
      } else {
        toast.error(result.error?.msg ?? "Action failed");
      }
    });
  };

  return (
    <div className="flex min-w-[280px] flex-col gap-2">
      <CompleteReferralPayoutDialog row={row} />

      <div className="flex flex-wrap gap-1">
        <Input
          className="h-8 flex-1 min-w-[100px] text-xs"
          placeholder="Failure reason"
          value={failReason}
          onChange={(e) => setFailReason(e.target.value)}
        />
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || !failReason.trim()}
          onClick={() =>
            run(() =>
              adminMarkReferralPayoutFailed(row.orderId, failReason.trim())
            )
          }
        >
          Fail
        </Button>
      </div>
    </div>
  );
}
