import {
  unlockPrincipalRequired,
  unlockSlotEquivalent,
} from "@/lib/config/investmentCohort";

export type PayoutUnlockerInput = {
  amountUsdt: number;
};

export function buildPayoutReason(
  headAmountUsdt: number,
  unlockers: PayoutUnlockerInput[]
): string | null {
  if (unlockers.length === 0) {
    return null;
  }

  const required = unlockPrincipalRequired(headAmountUsdt);
  const received = unlockers.reduce(
    (sum, inv) => sum + (inv.amountUsdt || 0),
    0
  );
  const equivalent = unlockSlotEquivalent(received, headAmountUsdt);
  const amountParts = unlockers
    .map((inv) => `${inv.amountUsdt} USDT`)
    .join(" + ");
  const countLabel =
    unlockers.length === 1
      ? "1 later investment"
      : `${unlockers.length} later investments`;

  return (
    `Unlocked after ${countLabel} (${amountParts}). ` +
    `Head invested ${headAmountUsdt} USDT; required ${required} USDT from newer investors (2× cohort). ` +
    `Received ${received} USDT (${equivalent}× equivalent).`
  );
}
