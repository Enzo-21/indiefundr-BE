"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getTronscanTxUrl } from "@/lib/tron/tronscanUrl";
import {
  badgeVariantForInvestmentStatus,
  badgeVariantForPayoutStatus,
} from "@/lib/admin/statusBadges";
import { InvestmentPayoutDialog } from "./InvestmentPayoutDialog";
import { PayNowButton, PayWithSurplusButton } from "./ReleasePayoutButton";
import type { InvestmentPayoutSeed } from "./useInvestmentPayoutWorkflow";

export type InvestmentPayoutRow = {
  id: string;
  userEmail: string;
  projectedPayoutUsdt: number;
  status: string;
  payoutStatus: string;
  canPayNow: boolean;
  canPayWithSurplus: boolean;
  showPayoutActions: boolean;
  payNowBlockReason: string | null;
  surplusBlockReason: string | null;
  payoutFailureReason: string | null;
  canClaim: boolean;
  canConfirmRedemption: boolean;
  confirmRedemptionBlockReason: string | null;
  redemptionTxId: string | null;
  payoutTriggeredBy?: string | null;
};

function rowSeed(row: InvestmentPayoutRow): InvestmentPayoutSeed {
  return {
    status: row.status,
    payoutFailureReason: row.payoutFailureReason,
    redemptionTxId: row.redemptionTxId,
    redemptionTronscanUrl: row.redemptionTxId
      ? getTronscanTxUrl(row.redemptionTxId)
      : null,
  };
}

function redeemingMode(row: InvestmentPayoutRow): "normal" | "surplus" {
  const trigger = row.payoutTriggeredBy ?? "";
  if (
    trigger.includes("surplus") ||
    trigger === "admin_surplus" ||
    trigger === "cron_surplus" ||
    trigger === "admin_surplus_liquidity" ||
    trigger === "cron_surplus_liquidity"
  ) {
    return "surplus";
  }
  return "normal";
}

function PayoutActionButtons({ row }: { row: InvestmentPayoutRow }) {
  const seed = rowSeed(row);

  if (row.canPayNow) {
    return (
      <div>
        <PayNowButton
          investmentId={row.id}
          userEmail={row.userEmail}
          amountUsdt={row.projectedPayoutUsdt}
          disabled={false}
          disabledReason={null}
          seed={seed}
        />
      </div>
    );
  }

  if (row.canPayWithSurplus) {
    return (
      <div>
        <PayWithSurplusButton
          investmentId={row.id}
          userEmail={row.userEmail}
          amountUsdt={row.projectedPayoutUsdt}
          disabled={false}
          disabledReason={null}
          seed={seed}
        />
      </div>
    );
  }

  const reason = row.payNowBlockReason ?? row.surplusBlockReason;
  if (reason) {
    return <p className="text-xs text-muted-foreground">{reason}</p>;
  }

  return <span className="text-muted-foreground">—</span>;
}

function RedeemingPayoutDialog({ row }: { row: InvestmentPayoutRow }) {
  const mode = redeemingMode(row);
  const seed = rowSeed(row);
  const isRetry = Boolean(row.payoutFailureReason);
  const isResume = Boolean(row.redemptionTxId) || !isRetry;

  const triggerLabel = isRetry
    ? mode === "surplus"
      ? "Retry surplus payout"
      : "Retry payout"
    : row.redemptionTxId
      ? "Complete payout"
      : "Resume payout";

  return (
    <InvestmentPayoutDialog
      investmentId={row.id}
      userEmail={row.userEmail}
      amountUsdt={row.projectedPayoutUsdt}
      mode={mode}
      triggerLabel={triggerLabel}
      triggerVariant={isRetry ? "destructive" : "secondary"}
      disabled={!isRetry && !isResume && !row.canConfirmRedemption}
      disabledReason={row.confirmRedemptionBlockReason}
      seed={seed}
    />
  );
}

export function InvestmentPayoutActions({ row }: { row: InvestmentPayoutRow }) {
  if (row.status === "redeemed") {
    return (
      <Badge variant={badgeVariantForPayoutStatus(row.payoutStatus)}>
        {row.payoutStatus}
      </Badge>
    );
  }

  if (row.status === "redeeming") {
    return (
      <div className="flex min-w-[200px] flex-col gap-2">
        {row.payoutFailureReason ? (
          <Badge variant={badgeVariantForPayoutStatus("failed")}>
            Payout failed
          </Badge>
        ) : (
          <Badge variant={badgeVariantForPayoutStatus(row.payoutStatus)}>
            {row.payoutStatus}
          </Badge>
        )}
        <RedeemingPayoutDialog row={row} />
        {row.redemptionTxId ? (
          <Link
            href={getTronscanTxUrl(row.redemptionTxId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            View payout on TronScan
          </Link>
        ) : null}
        {row.confirmRedemptionBlockReason &&
        !row.canConfirmRedemption &&
        !row.payoutFailureReason ? (
          <p className="text-xs text-muted-foreground">
            {row.confirmRedemptionBlockReason}
          </p>
        ) : null}
        {row.showPayoutActions ? <PayoutActionButtons row={row} /> : null}
      </div>
    );
  }

  if (!row.showPayoutActions) {
    if (row.canClaim) {
      return (
        <Badge variant={badgeVariantForInvestmentStatus("matured")}>
          Claimable
        </Badge>
      );
    }
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex min-w-[200px] flex-col gap-2">
      <PayoutActionButtons row={row} />
    </div>
  );
}
