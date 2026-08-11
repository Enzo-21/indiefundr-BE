import { APP_NAME } from "@/lib/constants/appBranding";
import {
  getFundById,
  getInvestmentAmountUsdtForLevel,
  isValidFundId,
} from "@/lib/config/pricing";
import {
  formatTronTransferError,
  isSponsorshipCoverableFeeError,
} from "@/lib/utils/tronErrors";
import { getMainWallet } from "@/lib/wallets/helpers";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import * as feeSponsorship from "@/services/tron/feeSponsorship";
import * as tron from "@/services/tron/client";
import { getInvestmentSlotUsage } from "@/lib/config/investmentSlots";
import {
  getActiveOrderForUser,
  getActiveOrdersForUser,
  getWalletUsdtAvailability,
} from "@/services/wallets/walletBalance";
import { logFundsEvent, logFundsRejected } from "./logging";
import { formatOrderResponse } from "./orders";

/** Conservative fee placeholder when simulation fails but sponsorship will top up. */
export const SPONSORED_FEE_ESTIMATE_FALLBACK_TRX = 30;

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

    const cost = getInvestmentAmountUsdtForLevel(user.level);

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

    const [estimateOutcome, availability, activeOrders, slotUsage] =
      await Promise.all([
        tron
          .estimateUsdtTransfer({
            fromAddress: sender.address,
            toAddress: receiver,
            amount: cost,
          })
          .then(
            (estimate) => ({ ok: true as const, estimate }),
            (error: unknown) => ({ ok: false as const, error })
          ),
        getWalletUsdtAvailability(sender),
        getActiveOrdersForUser(userId, fundId),
        getInvestmentSlotUsage(userId, fundId, undefined, user.level),
      ]);
    const activeOrder = activeOrders[0] ?? null;

    const feesCoveredByApp = feeSponsorship.isEnabled();
    const hasEnoughUsdt = availability.availableUsdt >= cost;

    if (!estimateOutcome.ok) {
      // Transfer simulation often reverts when the wallet cannot cover the USDT amount.
      // Still return balances so the UI can show a clear insufficient-funds state.
      if (!hasEnoughUsdt) {
        logFundsEvent("estimate", "info", "estimate skipped: insufficient usdt", {
          ...baseFields,
          cost,
          onChainUsdt: availability.onChainUsdt,
          availableUsdt: availability.availableUsdt,
          reservedUsdt: availability.reservedUsdt,
          hasEnoughUsdt,
          estimateError:
            estimateOutcome.error instanceof Error
              ? estimateOutcome.error.message
              : String(estimateOutcome.error),
        });

        return {
          ok: true,
          data: {
            fromAddress: sender.address,
            toAddress: receiver,
            amountUsdt: cost,
            estimatedTrx: 0,
            trxBalance: 0,
            usdtBalance: availability.onChainUsdt,
            hasEnoughTrx: true,
            onChainUsdt: availability.onChainUsdt,
            reservedUsdt: availability.reservedUsdt,
            availableUsdt: availability.availableUsdt,
            pendingOrdersCount: availability.pendingOrdersCount,
            hasEnoughUsdt: false,
            canTransfer: false,
            fundId,
            fund: getFundById(fundId),
            activeOrder: activeOrder ? formatOrderResponse(activeOrder) : null,
            activeOrders: activeOrders.map((order) => formatOrderResponse(order)),
            openCount: slotUsage.openCount,
            maxOpenInvestments: slotUsage.maxOpenInvestments,
            slotsAvailable: slotUsage.slotsAvailable,
            totalOpenCount: slotUsage.totalOpenCount,
            maxTotalOpenInvestments: slotUsage.maxTotalOpenInvestments,
            totalSlotsAvailable: slotUsage.totalSlotsAvailable,
            walletId: sender.id,
            isMainWallet: sender.isMainWallet,
            feesCoveredByApp,
            costBreakdown: {
              productUsdt: cost,
              networkFeeTrxEstimate: feesCoveredByApp ? undefined : 0,
              usdtPaidTo: "treasury",
              trxPaidTo: feesCoveredByApp
                ? "covered_by_indiefundr"
                : "tron_network",
              note: feesCoveredByApp
                ? `You only need USDT in your main wallet. ${APP_NAME} covers Tron network fees for investments.`
                : "USDT is the investment amount. TRX covers Tron network fees separately.",
            },
          },
        };
      }

      // With sponsorship, TRX/activation/energy simulation failures must not block invest.
      if (
        feesCoveredByApp &&
        isSponsorshipCoverableFeeError(estimateOutcome.error, {
          fromAddress: sender.address,
          usdtBalance: availability.availableUsdt,
          amountUsdt: cost,
        })
      ) {
        logFundsEvent(
          "estimate",
          "info",
          "estimate soft-ok: sponsorship covers fee error",
          {
            ...baseFields,
            cost,
            estimateError:
              estimateOutcome.error instanceof Error
                ? estimateOutcome.error.message
                : String(estimateOutcome.error),
          }
        );
        return {
          ok: true,
          data: {
            fromAddress: sender.address,
            toAddress: receiver,
            amountUsdt: cost,
            estimatedTrx: SPONSORED_FEE_ESTIMATE_FALLBACK_TRX,
            trxBalance: 0,
            usdtBalance: availability.onChainUsdt,
            hasEnoughTrx: false,
            hasEnoughEnergy: false,
            hasEnoughBandwidth: false,
            canTransferZeroBurn: false,
            onChainUsdt: availability.onChainUsdt,
            reservedUsdt: availability.reservedUsdt,
            availableUsdt: availability.availableUsdt,
            pendingOrdersCount: availability.pendingOrdersCount,
            hasEnoughUsdt: true,
            canTransfer: true,
            fundId,
            fund: getFundById(fundId),
            activeOrder: activeOrder ? formatOrderResponse(activeOrder) : null,
            activeOrders: activeOrders.map((order) => formatOrderResponse(order)),
            openCount: slotUsage.openCount,
            maxOpenInvestments: slotUsage.maxOpenInvestments,
            slotsAvailable: slotUsage.slotsAvailable,
            totalOpenCount: slotUsage.totalOpenCount,
            maxTotalOpenInvestments: slotUsage.maxTotalOpenInvestments,
            totalSlotsAvailable: slotUsage.totalSlotsAvailable,
            walletId: sender.id,
            isMainWallet: sender.isMainWallet,
            feesCoveredByApp: true,
            costBreakdown: {
              productUsdt: cost,
              networkFeeTrxEstimate: undefined,
              usdtPaidTo: "treasury",
              trxPaidTo: "covered_by_indiefundr",
              note: `You only need USDT in your main wallet. ${APP_NAME} covers Tron network fees for investments.`,
            },
          },
        };
      }

      const payload = formatTronTransferError(estimateOutcome.error, {
        fromAddress: sender.address,
        usdtBalance: availability.availableUsdt,
        amountUsdt: cost,
      });
      logFundsRejected("estimate", "fee_estimate_failed", {
        ...baseFields,
        code: payload.code,
        rawMessage: payload.rawMessage,
        error:
          estimateOutcome.error instanceof Error
            ? estimateOutcome.error.message
            : String(estimateOutcome.error),
      });
      return { ok: false, status: 400, body: payload };
    }

    const estimate = estimateOutcome.estimate;

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
        activeOrders: activeOrders.map((order) => formatOrderResponse(order)),
        openCount: slotUsage.openCount,
        maxOpenInvestments: slotUsage.maxOpenInvestments,
        slotsAvailable: slotUsage.slotsAvailable,
        totalOpenCount: slotUsage.totalOpenCount,
        maxTotalOpenInvestments: slotUsage.maxTotalOpenInvestments,
        totalSlotsAvailable: slotUsage.totalSlotsAvailable,
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
    let amountUsdt: number | undefined;
    let usdtBalance: number | undefined;
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        amountUsdt = getInvestmentAmountUsdtForLevel(user.level);
      }
      if (sender) {
        usdtBalance = (await getWalletUsdtAvailability(sender)).availableUsdt;
      }
    } catch {
      // Best-effort context for clearer error mapping.
    }
    const payload = formatTronTransferError(error, {
      fromAddress: sender?.address,
      amountUsdt,
      usdtBalance,
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
