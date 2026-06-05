"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { triggerTreasuryHistorySync } from "@/actions/treasury";
import { Button } from "@/components/ui/button";

export function SyncTreasuryHistoryButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await triggerTreasuryHistorySync();
          if (result.ok) {
            const { recorded, uniqueRows, scannedAddresses } = result.data;
            toast.success(
              `Treasury history synced: ${recorded} recorded from ${uniqueRows} rows (${scannedAddresses} addresses)`
            );
          } else {
            toast.error(result.error.msg);
          }
        });
      }}
    >
      {pending ? "Syncing…" : "Sync treasury history"}
    </Button>
  );
}
