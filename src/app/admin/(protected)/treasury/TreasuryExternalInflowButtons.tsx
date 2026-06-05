"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { classifyTreasuryTransaction } from "@/actions/treasury";
import { Button } from "@/components/ui/button";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import type { ExternalInflowTreatment } from "@/services/revenueEngine/externalTreasuryInflows";

export type TreasuryExternalInflowButtonProps = {
  txId: string;
  amountUsdt: number;
  inflowTreatment: ExternalInflowTreatment;
  inflowActionsEligible: boolean;
  onUpdated?: () => void;
};

type InflowIntent =
  | "mark_inflow_withdrawable"
  | "mark_inflow_surplus"
  | "clear_inflow_classification";

function treatmentLabel(treatment: ExternalInflowTreatment): string {
  switch (treatment) {
    case "withdrawable":
      return "Withdrawable";
    case "surplus":
      return "Surplus";
    default:
      return "External";
  }
}

export function TreasuryExternalInflowButtons({
  txId,
  amountUsdt,
  inflowTreatment,
  inflowActionsEligible,
  onUpdated,
}: TreasuryExternalInflowButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!inflowActionsEligible) {
    return null;
  }

  async function run(intent: InflowIntent) {
    setError(null);
    const formattedAmount = formatUsdtDisplay(amountUsdt);
    let message = "";

    switch (intent) {
      case "mark_inflow_withdrawable":
        message =
          inflowTreatment === "surplus"
            ? `Move ${formattedAmount} USDT from surplus to withdrawable liquidity?`
            : `Record ${formattedAmount} USDT as withdrawable liquidity on the internal ledger?`;
        break;
      case "mark_inflow_surplus":
        message = `Treat ${formattedAmount} USDT as surplus reserved for user payouts? This keeps the amount out of withdrawable liquidity.`;
        break;
      case "clear_inflow_classification":
        message = `Clear classification and remove ${formattedAmount} USDT from the internal ledger? The on-chain deposit will remain as an external transaction only.`;
        break;
    }

    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await classifyTreasuryTransaction({
        txId,
        intent,
        amountUsdt,
      });
      if (!result.ok) {
        setError(result.error.msg);
        return;
      }
      if (onUpdated) {
        onUpdated();
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {inflowTreatment === "none" ? (
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => run("mark_inflow_withdrawable")}
          >
            Mark as withdrawable
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run("mark_inflow_surplus")}
          >
            Mark as surplus
          </Button>
        </>
      ) : (
        <>
          {inflowTreatment === "withdrawable" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run("mark_inflow_surplus")}
            >
              Mark as surplus
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run("mark_inflow_withdrawable")}
            >
              Mark as withdrawable
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run("clear_inflow_classification")}
          >
            Clear classification
          </Button>
        </>
      )}
      <span className="text-[10px] text-muted-foreground">
        {treatmentLabel(inflowTreatment)}
      </span>
      {error ? (
        <span className="max-w-[180px] text-right text-[10px] text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
