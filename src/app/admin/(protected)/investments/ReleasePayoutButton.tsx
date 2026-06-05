"use client";

import { InvestmentPayoutDialog } from "./InvestmentPayoutDialog";
import type { InvestmentPayoutSeed } from "./useInvestmentPayoutWorkflow";

export function PayNowButton({
  investmentId,
  userEmail,
  amountUsdt,
  disabled = false,
  disabledReason,
  seed,
}: {
  investmentId: string;
  userEmail: string;
  amountUsdt: number;
  disabled?: boolean;
  disabledReason?: string | null;
  seed?: InvestmentPayoutSeed;
}) {
  return (
    <InvestmentPayoutDialog
      investmentId={investmentId}
      userEmail={userEmail}
      amountUsdt={amountUsdt}
      mode="normal"
      triggerLabel="Pay now"
      triggerVariant="outline"
      disabled={disabled}
      disabledReason={disabledReason}
      seed={seed}
    />
  );
}

export function PayWithSurplusButton({
  investmentId,
  userEmail,
  amountUsdt,
  disabled = false,
  disabledReason,
  seed,
}: {
  investmentId: string;
  userEmail: string;
  amountUsdt: number;
  disabled?: boolean;
  disabledReason?: string | null;
  seed?: InvestmentPayoutSeed;
}) {
  return (
    <InvestmentPayoutDialog
      investmentId={investmentId}
      userEmail={userEmail}
      amountUsdt={amountUsdt}
      mode="surplus"
      triggerLabel="Pay with surplus"
      triggerVariant="secondary"
      disabled={disabled}
      disabledReason={disabledReason}
      seed={seed}
    />
  );
}
