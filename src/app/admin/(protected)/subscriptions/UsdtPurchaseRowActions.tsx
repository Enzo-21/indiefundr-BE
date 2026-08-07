"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  adminBroadcastUsdtPurchase,
  adminCompleteUsdtPurchase,
  adminMarkUsdtPurchaseFailed,
} from "@/actions/admin/usdtPurchaseOrders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUsdtPurchaseRow } from "@/services/admin/usdtPurchaseOrderFulfillment";

export function UsdtPurchaseRowActions({ row }: { row: AdminUsdtPurchaseRow }) {
  const [failReason, setFailReason] = useState("");
  const [usdtTxId, setUsdtTxId] = useState(row.adminUsdtTxId ?? "");
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
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const broadcast = await adminBroadcastUsdtPurchase(row.orderId);
            if (!broadcast.ok) return broadcast;
            const txId = broadcast.data.txId;
            if (txId) setUsdtTxId(txId);
            return adminCompleteUsdtPurchase(row.orderId, txId);
          })
        }
      >
        Release USDT
      </Button>
      <div className="flex flex-wrap gap-1">
        <Input
          className="h-8 flex-1 min-w-[120px] text-xs"
          placeholder="USDT tx id (optional override)"
          value={usdtTxId}
          onChange={(e) => setUsdtTxId(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !usdtTxId.trim()}
          onClick={() =>
            run(() => adminCompleteUsdtPurchase(row.orderId, usdtTxId.trim()))
          }
        >
          Mark done
        </Button>
      </div>
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
              adminMarkUsdtPurchaseFailed(row.orderId, failReason.trim())
            )
          }
        >
          Fail
        </Button>
      </div>
      {row.mpPaymentId ? (
        <p className="text-xs text-muted-foreground">
          MP payment {row.mpPaymentId}
        </p>
      ) : null}
    </div>
  );
}
