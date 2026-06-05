import {
  WithdrawalOrderStatus,
  WithdrawalOrderStep,
} from "@prisma/client";
import { formatTronTransferError } from "@/lib/utils/tronErrors";
import { getMainWallet } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import { buildIndieFundrMemo, isIndieFundrChainMemoEnabled } from "@/lib/tron/transactionMemo";
import * as tron from "@/services/tron/client";
import {
  getActiveWithdrawalForUser,
  getWalletUsdtAvailability,
} from "./walletBalance";
import { formatWithdrawalOrderResponse } from "./withdrawalOrderFormat";
import { rebuildWalletActivity } from "./walletActivityMaterializer";
import { validateWithdrawalDestination } from "./withdrawalDestination";

export type { WithdrawalDestinationValidation } from "./withdrawalDestination";
export { validateWithdrawalDestination } from "./withdrawalDestination";

export type WithdrawalServiceResult<T> =
  | { ok: true; data: T; status?: number }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown> | string;
      plainText?: boolean;
    };

export async function createWithdrawalOrder(
  userId: string,
  input: { amountUsdt: number; destinationAddress: string; device?: string }
): Promise<WithdrawalServiceResult<Record<string, unknown>>> {
  const { amountUsdt, destinationAddress, device } = input;
  const amount = parseFloat(Number(amountUsdt).toFixed(4));

  if (amount <= 0) {
    return {
      ok: false,
      status: 400,
      body: { msg: "Amount must be greater than zero" },
    };
  }

  const wallet = await getMainWallet(userId);
  if (!wallet) {
    return { ok: false, status: 404, body: { msg: "Wallet not found" } };
  }

  if (!(await tron.validateAddress(wallet.address))) {
    return {
      ok: false,
      status: 400,
      body: {
        msg: "Wallet uses a legacy address format. Please add a new Tron wallet.",
      },
    };
  }

  const destCheck = await validateWithdrawalDestination(
    userId,
    destinationAddress
  );
  if (!destCheck.valid) {
    return {
      ok: false,
      status: 400,
      body: { msg: destCheck.message },
    };
  }
  const destNorm = destCheck.normalizedAddress;

  const availability = await getWalletUsdtAvailability(wallet);
  if (availability.availableUsdt < amount) {
    const earlyError = formatTronTransferError(
      { message: "insufficient usdt" },
      {
        fromAddress: wallet.address,
        usdtBalance: availability.availableUsdt,
        amountUsdt: amount,
      }
    );
    return {
      ok: false,
      status: 400,
      body: {
        ...earlyError,
        onChainUsdt: availability.onChainUsdt,
        reservedUsdt: availability.reservedUsdt,
        availableUsdt: availability.availableUsdt,
      },
    };
  }

  let estimatedTrx: number | undefined;
  try {
    const feeEstimate = await tron.estimateUsdtTransfer({
      fromAddress: wallet.address,
      toAddress: destNorm,
      amount,
    });
    estimatedTrx = feeEstimate.estimatedTrx;
  } catch (estimateError) {
    const body = formatTronTransferError(estimateError, {
      fromAddress: wallet.address,
    });
    return { ok: false, status: 400, body };
  }

  const order = await prisma.withdrawalOrder.create({
    data: {
      userId,
      walletId: wallet.id,
      amountUsdt: amount,
      reservedUsdt: amount,
      destinationAddress: destNorm,
      status: WithdrawalOrderStatus.queued,
      step: WithdrawalOrderStep.awaiting_trx,
      estimatedTrx,
    },
  });

  let chainMemo: string | undefined;
  if (isIndieFundrChainMemoEnabled()) {
    chainMemo = buildIndieFundrMemo({
      kind: "withdraw",
      fundId: "withdraw",
      entityId: order.id,
    });
    await prisma.withdrawalOrder.update({
      where: { id: order.id },
      data: { chainMemo },
    });
  }

  await rebuildWalletActivity(userId, wallet.id, wallet.id);

  const refreshed = await prisma.withdrawalOrder.findUnique({
    where: { id: order.id },
  });

  return {
    ok: true,
    status: 202,
    data: formatWithdrawalOrderResponse(refreshed ?? order),
  };
}

export async function getWithdrawalOrderById(
  userId: string,
  orderId: string
): Promise<WithdrawalServiceResult<Record<string, unknown>>> {
  const order = await prisma.withdrawalOrder.findFirst({
    where: { id: orderId, userId },
  });
  if (!order) {
    return { ok: false, status: 404, body: { msg: "Withdrawal order not found" } };
  }
  return { ok: true, data: formatWithdrawalOrderResponse(order) };
}

export async function getCurrentWithdrawalOrder(
  userId: string
): Promise<WithdrawalServiceResult<Record<string, unknown> | null>> {
  const order = await getActiveWithdrawalForUser(userId);
  if (!order) {
    return { ok: true, data: null };
  }
  return { ok: true, data: formatWithdrawalOrderResponse(order) };
}
