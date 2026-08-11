import {
  WithdrawalOrderStatus,
  WithdrawalOrderStep,
  type WithdrawalOrder,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import * as tron from "@/services/tron/client";

export type CreateTreasuryWithdrawalInput = {
  amountUsdt: number;
  destinationAddress: string;
  adminEmail: string;
};

export type CreateTreasuryWithdrawalResult = {
  order: WithdrawalOrder;
};

/**
 * Queue a withdrawal that sends USDT from the app Treasury (admin-only).
 * No IndieFundr user/wallet attribution is required.
 */
export async function createTreasuryWithdrawalOrder(
  input: CreateTreasuryWithdrawalInput
): Promise<CreateTreasuryWithdrawalResult> {
  const amount = parseFloat(Number(input.amountUsdt).toFixed(4));
  if (!(amount > 0)) {
    throw new Error("Amount must be greater than zero");
  }

  const treasuryAddress = getEnv().treasuryAddress?.trim();
  const treasuryPk = getEnv().treasuryPrivateKey?.trim();
  if (!treasuryAddress || !treasuryPk) {
    throw new Error("Treasury is not configured");
  }

  const destNorm =
    (await tron.normalizeTronAddress(input.destinationAddress.trim())) ??
    input.destinationAddress.trim();
  if (!(await tron.validateAddress(destNorm))) {
    throw new Error("Enter a valid Tron (TRC20) address");
  }

  const treasuryNorm =
    (await tron.normalizeTronAddress(treasuryAddress)) ?? treasuryAddress;
  if (destNorm === treasuryNorm) {
    throw new Error("Destination cannot be the treasury address");
  }

  const adminEmail = input.adminEmail.trim().toLowerCase();

  const usdtBalance = await tron.getUsdtBalance(treasuryAddress);
  if (usdtBalance < amount) {
    throw new Error(
      `Treasury has insufficient USDT (available ${usdtBalance.toFixed(4)}, need ${amount.toFixed(4)})`
    );
  }

  let estimatedTrx: number | undefined;
  try {
    const feeEstimate = await tron.estimateUsdtTransfer({
      fromAddress: treasuryAddress,
      toAddress: destNorm,
      amount,
    });
    estimatedTrx = feeEstimate.estimatedTrx;
  } catch (estimateError) {
    const message =
      estimateError instanceof Error
        ? estimateError.message
        : String(estimateError);
    throw new Error(`Could not estimate withdrawal fees: ${message}`);
  }

  const order = await prisma.withdrawalOrder.create({
    data: {
      amountUsdt: amount,
      reservedUsdt: 0,
      destinationAddress: destNorm,
      status: WithdrawalOrderStatus.queued,
      step: WithdrawalOrderStep.awaiting_trx,
      estimatedTrx,
      fromTreasury: true,
      adminSettledBy: adminEmail,
      adminNotes: "Treasury withdrawal (admin)",
    },
  });

  return { order };
}
