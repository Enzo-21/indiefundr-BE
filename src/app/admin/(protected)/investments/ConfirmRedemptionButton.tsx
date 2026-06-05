"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { adminConfirmInvestmentRedemption } from "@/actions/admin/investments";
import { Button } from "@/components/ui/button";

export function ConfirmRedemptionButton({
  investmentId,
  disabled = false,
  disabledReason,
}: {
  investmentId: string;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled || pending}
      title={disabled ? disabledReason ?? "Not available" : undefined}
      onClick={() => {
        startTransition(async () => {
          const result = await adminConfirmInvestmentRedemption(investmentId);
          if (result.ok) {
            toast.success("Payout confirmed on-chain");
            router.refresh();
          } else {
            toast.error(result.error.msg);
          }
        });
      }}
    >
      {pending ? "Confirming…" : "Confirm payout on-chain"}
    </Button>
  );
}
