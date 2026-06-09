import { APP_NAME } from "@/lib/constants/appBranding";
import {
  getFundById,
  getInvestmentAmountUsdt,
  isValidFundId,
} from "@/lib/config/pricing";
import { formatTronTransferError } from "@/lib/utils/tronErrors";
import { getMainWallet } from "@/lib/wallets/helpers";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import * as feeSponsorship from "@/services/tron/feeSponsorship";
import * as tron from "@/services/tron/client";
import { getInvestmentSlotUsage } from "@/lib/config/investmentSlots";
import {
  getActiveOrderForUser,
  getWalletUsdtAvailability,
} from "@/services/wallets/walletBalance";
import { logFundsEvent, logFundsRejected } from "./logging";
import { formatOrderResponse } from "./orders";

export type FundsServiceResult<T> =
  | { ok: true; data: T; status?: number }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown> | string;
      plainText?: boolean;
    };

export async function getSubscribeFeeEstimate(
  userId: string,
  fundId: string
): Promise<FundsServiceResult<Record<string, unknown>>> {
  const baseFields = { userId, fundId };

  if (!isValidFundId(fundId)) {
    logFundsRejected("estimate", "invalid_fund", baseFields);
    return { ok: false, status: 400, body: { msg: "Invalid fund" } };
  }

  try {
    const cost = getInvestmentAmountUsdt();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      logFundsRejected("estimate", "user_not_found", baseFields);
      return {
        ok: false,
        status: 404,
        body: "User not found",
        plainText: true,
      };
    }

    const sender = await getMainWallet(userId);
    if (!sender) {
      logFundsRejected("estimate", "wallet_not_found", baseFields);
      return { ok: false, status: 404, body: { msg: "Wallet not found" } };
    }

    const receiver = getEnv().treasuryAddress;
    if (!receiver) {
      logFundsRejected("estimate", "treasury_not_configured", baseFields);
      return {
        ok: false,
        status: 500,
        body: { msg: "Treasury wallet is not configured" },
      };
    }

    if (!(await tron.validateAddress(sender.address))) {
      logFundsRejected("estimate", "legacy_wallet_address", {
        ...baseFields,
        walletId: sender.id,
        address: sender.address,
      });
      return {
        ok: false,
        status: 400,
        body: {
          msg: "Wallet uses a legacy address format. Please add a new Tron wallet.",
        },
      };
    }

    const [estimate, availability, activeOrder, slotUsage] = await Promise.all([
      tron.estimateUsdtTransfer({
        fromAddress: sender.address,
        toAddress: receiver,
        amount: cost,
      }),
      getWalletUsdtAvailability(sender),
      getActiveOrderForUser(userId, fundId),
      getInvestmentSlotUsage(userId, fundId),
    ]);

    const feesCoveredByApp = feeSponsorship.isEnabled();
    const hasEnoughUsdt = availability.availableUsdt >= cost;

    logFundsEvent("estimate", "info", "estimate ready", {
      ...baseFields,
      cost,
      onChainUsdt: availability.onChainUsdt,
      availableUsdt: availability.availableUsdt,
      reservedUsdt: availability.reservedUsdt,
      hasEnoughUsdt,
      canTransfer:
        hasEnoughUsdt && (feesCoveredByApp || estimate.hasEnoughTrx),
      activeOrderId: activeOrder?.id ?? null,
    });

    return {
      ok: true,
      data: {
        ...estimate,
        fundId,
        fund: getFundById(fundId),
        onChainUsdt: availability.onChainUsdt,
        reservedUsdt: availability.reservedUsdt,
        availableUsdt: availability.availableUsdt,
        pendingOrdersCount: availability.pendingOrdersCount,
        hasEnoughUsdt,
        canTransfer:
          hasEnoughUsdt && (feesCoveredByApp || estimate.hasEnoughTrx),
        activeOrder: activeOrder ? formatOrderResponse(activeOrder) : null,
        openCount: slotUsage.openCount,
        maxOpenInvestments: slotUsage.maxOpenInvestments,
        slotsAvailable: slotUsage.slotsAvailable,
        walletId: sender.id,
        isMainWallet: sender.isMainWallet,
        feesCoveredByApp,
        costBreakdown: {
          productUsdt: cost,
          networkFeeTrxEstimate: feesCoveredByApp
            ? undefined
            : estimate.estimatedTrx,
          usdtPaidTo: "treasury",
          trxPaidTo: feesCoveredByApp ? "covered_by_indiefundr" : "tron_network",
          note: feesCoveredByApp
            ? `You only need USDT in your main wallet. ${APP_NAME} covers Tron network fees for investments.`
            : "USDT is the investment amount. TRX covers Tron network fees separately.",
        },
      },
    };
  } catch (error) {
    const sender = await getMainWallet(userId).catch(() => null);
    const payload = formatTronTransferError(error, {
      fromAddress: sender?.address,
    });
    logFundsRejected("estimate", "fee_estimate_failed", {
      ...baseFields,
      code: payload.code,
      rawMessage: payload.rawMessage,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, status: 400, body: payload };
  }
}
