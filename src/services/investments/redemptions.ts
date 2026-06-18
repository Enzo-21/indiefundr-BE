import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  type Investment,
} from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import { creditSurplus } from "@/services/revenueEngine/ledger";
import { onRedeemCompleted } from "@/services/revenueEngine/onRedeemCompleted";
import { releasePayoutLock } from "@/services/revenueEngine/payoutLock";
import { isSurplusPayoutTrigger } from "@/services/revenueEngine/payoutScheduler";
import * as tron from "@/services/tron/client";
import { prisma } from "@/lib/prisma";

export type RedemptionConfirmOutcome =
  | "confirmed"
  | "pending"
  | "failed_reverted"
  | "skipped";

export type RedemptionConfirmResult = {
  outcome: RedemptionConfirmOutcome;
  reason?: string;
};

async function processRedemptionForInvestment(
  investment: Investment
): Promise<RedemptionConfirmOutcome> {
  const txId = tron.getTxId(
    investment.redemptionTransaction as Record<string, unknown> | null
  );
  if (!txId) {
    return "skipped";
  }

  const status = await tron.getTransactionStatus(txId);
  if (status === "pending") {
    return "pending";
  }

  if (status === "failed") {
    if (isSurplusPayoutTrigger(investment.payoutTriggeredBy)) {
      await creditSurplus(investment.projectedPayoutUsdt, investment, {
        reason: "surplus_payout_failed_on_chain",
        trigger: investment.payoutTriggeredBy,
        txId,
      });
    }
    const fallbackStatus =
      investment.maturesAt && investment.maturesAt <= new Date()
        ? InvestmentStatus.matured
        : InvestmentStatus.active;
    await prisma.investment.update({
      where: { id: investment.id },
      data: {
        status: fallbackStatus,
        payabilityStatus: investment.payoutUnlockedAt
          ? InvestmentPayabilityStatus.payable
          : InvestmentPayabilityStatus.pending_liquidity,
        redemptionTransaction: null,
        payoutFailureReason: "Redemption transaction failed on-chain",
      },
    });
      await releasePayoutLock(investment.id);
      console.warn("[redemption] failed, reverted to matured", investment.id);
    return "failed_reverted";
  }

  const redeemed = await prisma.investment.update({
    where: { id: investment.id },
    data: {
      status: InvestmentStatus.redeemed,
      redeemedAt: new Date(),
      payabilityStatus: InvestmentPayabilityStatus.not_matured,
    },
  });

  try {
    await onRedeemCompleted(redeemed);
    await releasePayoutLock(investment.id);
  } catch (engineErr) {
    const message =
      engineErr instanceof Error ? engineErr.message : String(engineErr);
    console.error("[revenueEngine] onRedeemCompleted failed:", message);
  }

  const fund = getFundById(investment.fundId);
  console.log("[redemption] completed", {
    investmentId: investment.id,
    fundName: fund?.name || investment.fundId,
    amountUsdt: investment.projectedPayoutUsdt,
  });

  try {
    const { notifyUserPayment } = await import(
      "@/services/mailing/notifyUserPayment"
    );
    await notifyUserPayment({
      kind: "investment_payout",
      investment: redeemed,
      txId,
      fund: fund ?? undefined,
    });
  } catch (notifyErr) {
    const message =
      notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
    console.error("[mail] notifyUserPayment failed:", message, {
      investmentId: investment.id,
    });
  }

  return "confirmed";
}

export async function confirmInvestmentRedemption(
  investmentId: string
): Promise<RedemptionConfirmResult> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
  });

  if (!investment) {
    return { outcome: "skipped", reason: "not_found" };
  }
  if (investment.status !== InvestmentStatus.redeeming) {
    return { outcome: "skipped", reason: "not_redeeming" };
  }

  const txId = tron.getTxId(
    investment.redemptionTransaction as Record<string, unknown> | null
  );
  if (!txId) {
    return { outcome: "skipped", reason: "no_tx_id" };
  }

  const outcome = await processRedemptionForInvestment(investment);
  if (outcome === "skipped") {
    return { outcome: "skipped", reason: "no_tx_id" };
  }
  return { outcome };
}

export async function processRedemptionConfirmations(): Promise<{
  checked: number;
  confirmed: number;
}> {
  const redeeming = await prisma.investment.findMany({
    where: { status: InvestmentStatus.redeeming },
  });

  let confirmed = 0;
  for (const investment of redeeming) {
    const outcome = await processRedemptionForInvestment(investment);
    if (outcome === "confirmed") {
      confirmed += 1;
    }
  }

  return { checked: redeeming.length, confirmed };
}
