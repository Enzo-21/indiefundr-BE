"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  adminWithdrawalRecordTrxTopUp,
  adminWithdrawalRecordUsdtPayment,
  adminWithdrawalMarkFailed,
} from "@/actions/admin/withdrawals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminWithdrawalRow } from "@/services/admin/withdrawalOrderFulfillment";
import { CompleteWithdrawalDialog } from "./CompleteWithdrawalDialog";

export function WithdrawalRowActions({ row }: { row: AdminWithdrawalRow }) {
  const [trxTxId, setTrxTxId] = useState(row.topUpTxId ?? "");
  const [usdtTxId, setUsdtTxId] = useState(row.usdtTxId ?? "");
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
      <CompleteWithdrawalDialog row={row} />

      <div className="flex flex-wrap gap-1">
        <Input
          className="h-8 flex-1 min-w-[120px] text-xs"
          placeholder="TRX top-up tx id"
          value={trxTxId}
          onChange={(e) => setTrxTxId(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !trxTxId.trim()}
          onClick={() =>
            run(() =>
              adminWithdrawalRecordTrxTopUp(row.orderId, trxTxId.trim())
            )
          }
        >
          Save TRX
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Input
          className="h-8 flex-1 min-w-[120px] text-xs"
          placeholder="USDT payment tx id"
          value={usdtTxId}
          onChange={(e) => setUsdtTxId(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !usdtTxId.trim()}
          onClick={() =>
            run(() =>
              adminWithdrawalRecordUsdtPayment(row.orderId, usdtTxId.trim())
            )
          }
        >
          Save USDT
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
              adminWithdrawalMarkFailed(row.orderId, failReason.trim())
            )
          }
        >
          Fail
        </Button>
      </div>
    </div>
  );
}
