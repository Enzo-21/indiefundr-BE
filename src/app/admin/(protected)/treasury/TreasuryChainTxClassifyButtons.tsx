"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SerializedTreasuryOnChainReport } from "@/lib/serializers/treasuryAdmin";
import { classifyTreasuryTransaction } from "@/actions/treasury";
import { Button } from "@/components/ui/button";

type ChainTx = SerializedTreasuryOnChainReport["transactions"][number];

function isWithdrawalClassifiable(tx: ChainTx): boolean {
  return (
    tx.type === "out" &&
    (tx.category === "app_withdrawal" ||
      tx.category === "treasury_outflow_untracked")
  );
}

type Props = {
  tx: ChainTx;
};

export function TreasuryChainTxClassifyButtons({ tx }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isWithdrawalClassifiable(tx)) {
    return null;
  }

  async function run(intent: "link_withdrawal" | "unlink_withdrawal") {
    setError(null);
    const message =
      intent === "link_withdrawal"
        ? `Record ${tx.amount} USDT as an app withdrawal? This will debit the internal ledger pool and increase "Withdrawn".`
        : `Mark this transfer as untracked and remove it from the ledger${tx.ledgerRecorded ? " (reverses the recorded withdrawal)" : ""}?`;

    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await classifyTreasuryTransaction({
        txId: tx.txId,
        intent,
        amountUsdt: tx.amount,
      });
      if (!result.ok) {
        setError(result.error.msg);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {tx.category === "treasury_outflow_untracked" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => run("link_withdrawal")}
        >
          Record as app withdrawal
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run("unlink_withdrawal")}
        >
          Mark untracked
        </Button>
      )}
      {tx.adminCategoryOverride ? (
        <span className="text-[10px] text-muted-foreground">Admin override</span>
      ) : null}
      {error ? (
        <span className="max-w-[180px] text-right text-[10px] text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
