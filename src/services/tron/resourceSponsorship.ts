import {
  FeeSponsorshipMode,
  PurchaseOrderStatus,
  PurchaseOrderStep,
  WithdrawalOrderStatus,
  WithdrawalOrderStep,
} from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import * as feeSponsorship from "@/services/tron/feeSponsorship";
import * as tron from "@/services/tron/client";
import type { UsdtTransferEstimate } from "@/services/tron/client";

/** Keep in sync with purchaseOrderFulfillment.ADMIN_TRX_TOPUP_BUFFER_RATIO */
export const TRX_TOPUP_BUFFER_RATIO = 1.5;

/** Minimum TRX top-up when energy/bandwidth shortfall exists but estimate understates need. */
const MIN_TOPUP_WHEN_RESOURCE_SHORTFALL_TRX = 0.5;

/**
 * Top-up amount = max(estimatedTrx, minEstimatedTrx) × buffer − wallet TRX.
 * When zero-burn is impossible and the formula yields ≤0, force a floor so we
 * never skip sponsorship while Energy/Bandwidth are still short.
 */
export function computeTrxTopUpAmount(
  estimate: {
    estimatedTrx: number;
    trxBalance: number;
    canTransferZeroBurn?: boolean;
    energyShortfall?: number;
    bandwidthShortfall?: number;
  },
  minEstimatedTrx = 0
): { amountTrx: number; targetTrx: number; neededTrx: number } {
  const neededTrx = Math.max(
    Number(estimate.estimatedTrx) || 0,
    Number(minEstimatedTrx) || 0
  );
  const targetTrx = parseFloat(
    (neededTrx * TRX_TOPUP_BUFFER_RATIO).toFixed(6)
  );
  let amountTrx = parseFloat(
    Math.max(0, targetTrx - (Number(estimate.trxBalance) || 0)).toFixed(6)
  );

  const hasResourceShortfall =
    estimate.canTransferZeroBurn === false ||
    (Number(estimate.energyShortfall) || 0) > 0 ||
    (Number(estimate.bandwidthShortfall) || 0) > 0;

  if (amountTrx <= 0 && hasResourceShortfall) {
    amountTrx = MIN_TOPUP_WHEN_RESOURCE_SHORTFALL_TRX;
  }

  return { amountTrx, targetTrx, neededTrx };
}

/** Admin-facing message when treasury cannot fund a TRX top-up. */
export function formatTreasuryInsufficientForTopUpError(
  needTrx: number,
  treasuryTrx: number
): string {
  return `Treasury TRX insufficient for top-up: need ${needTrx} TRX, treasury has ${treasuryTrx} TRX. Fund treasury and retry.`;
}

export type SponsorshipOrderKind = "purchase" | "withdrawal";

export type SponsorTransferResourcesResult = {
  mode: FeeSponsorshipMode;
  skipped: boolean;
  estimate: UsdtTransferEstimate;
  shortfall: number;
  energyRentTxId: string | null;
  bandwidthRentTxId: string | null;
  energyRentAmountSun: string | null;
  bandwidthRentAmountSun: string | null;
  energyTarget: number | null;
  topUpTxId: string | null;
  amountTrx: number;
  targetTrx: number;
  bufferRatio: number;
  detail: string;
};

export type FinalizeSponsoredResourcesResult = {
  mode: FeeSponsorshipMode | null;
  energyReturnTxId: string | null;
  sweepTxId: string | null;
  recoveredTrx: number;
  detail: string;
};

function logSponsor(
  orderKind: SponsorshipOrderKind,
  orderId: string,
  event: string,
  payload: Record<string, unknown> = {}
) {
  console.log("[resource-sponsorship]", {
    orderKind,
    orderId,
    event,
    ...payload,
  });
}

async function persistPurchaseSponsorship(
  orderId: string,
  data: {
    sponsorshipMode: FeeSponsorshipMode;
    estimatedTrx: number;
    trxBefore: number;
    topUpTxId?: string | null;
    sponsoredTrx?: number;
    sponsorRound?: number;
    topUpTxIds?: string[];
    adminTrxTopUpTxId?: string | null;
  }
) {
  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      ...data,
      status: PurchaseOrderStatus.processing,
      step: PurchaseOrderStep.awaiting_usdt,
      updatedAt: new Date(),
    },
  });
}

async function persistWithdrawalSponsorship(
  orderId: string,
  data: {
    sponsorshipMode: FeeSponsorshipMode;
    estimatedTrx: number;
    trxBefore: number;
    topUpTxId?: string | null;
    sponsoredTrx?: number;
    sponsorRound?: number;
    topUpTxIds?: string[];
    adminTrxTopUpTxId?: string | null;
  }
) {
  await prisma.withdrawalOrder.update({
    where: { id: orderId },
    data: {
      ...data,
      status: WithdrawalOrderStatus.processing,
      step: WithdrawalOrderStep.awaiting_usdt,
      updatedAt: new Date(),
    },
  });
}

async function applyTrxTopUp({
  orderKind,
  orderId,
  userId,
  walletAddress,
  estimate,
  existingSponsoredTrx,
  existingTopUpTxIds,
  minEstimatedTrx = 0,
}: {
  orderKind: SponsorshipOrderKind;
  orderId: string;
  userId: string;
  walletAddress: string;
  estimate: UsdtTransferEstimate;
  existingSponsoredTrx: number;
  existingTopUpTxIds: string[];
  minEstimatedTrx?: number;
}): Promise<SponsorTransferResourcesResult> {
  const treasuryPk = getEnv().treasuryPrivateKey?.trim();
  if (!treasuryPk) {
    throw new Error("Treasury private key is not configured");
  }

  const { amountTrx, targetTrx, neededTrx } = computeTrxTopUpAmount(
    estimate,
    minEstimatedTrx
  );
  const shortfall = feeSponsorship.computeSponsorShortfall(estimate);
  const base = {
    mode: FeeSponsorshipMode.trx_topup,
    estimate,
    shortfall,
    energyRentTxId: null as string | null,
    bandwidthRentTxId: null as string | null,
    energyRentAmountSun: null as string | null,
    bandwidthRentAmountSun: null as string | null,
    energyTarget: null as number | null,
    targetTrx,
    bufferRatio: TRX_TOPUP_BUFFER_RATIO,
  };

  if (amountTrx <= 0) {
    const detail =
      "Wallet has enough TRX to burn fees — skipping top-up";
    const persist = {
      sponsorshipMode: FeeSponsorshipMode.trx_topup,
      estimatedTrx: Math.max(estimate.estimatedTrx, neededTrx),
      trxBefore: estimate.trxBalance,
    };
    if (orderKind === "purchase") {
      await persistPurchaseSponsorship(orderId, persist);
    } else {
      await persistWithdrawalSponsorship(orderId, persist);
    }
    return {
      ...base,
      skipped: true,
      topUpTxId: null,
      amountTrx: 0,
      detail,
    };
  }

  const treasuryAddress = getEnv().treasuryAddress?.trim();
  if (
    treasuryAddress &&
    walletAddress.trim().toLowerCase() === treasuryAddress.toLowerCase()
  ) {
    const detail =
      "Sender is treasury — skipping self TRX top-up; treasury will burn own TRX";
    const persist = {
      sponsorshipMode: FeeSponsorshipMode.trx_topup,
      estimatedTrx: Math.max(estimate.estimatedTrx, neededTrx),
      trxBefore: estimate.trxBalance,
    };
    if (orderKind === "purchase") {
      await persistPurchaseSponsorship(orderId, persist);
    } else {
      await persistWithdrawalSponsorship(orderId, persist);
    }
    return {
      ...base,
      skipped: true,
      topUpTxId: null,
      amountTrx: 0,
      detail,
    };
  }

  await feeSponsorship.assertCanSponsor(userId, amountTrx, {
    existingSponsoredOnOrder: existingSponsoredTrx,
  });

  const treasuryFromAddress =
    treasuryAddress || (await tron.privateKeyToAddress(treasuryPk));
  const treasuryTrxBalance = await tron.getTrxBalance(treasuryFromAddress);
  const treasuryTransferFee = await tron.estimateTrxTransferFee(
    treasuryFromAddress
  );
  const needTrx = parseFloat(
    (amountTrx + treasuryTransferFee.estimatedTrx).toFixed(6)
  );
  if (treasuryTrxBalance < needTrx) {
    throw new Error(
      formatTreasuryInsufficientForTopUpError(needTrx, treasuryTrxBalance)
    );
  }

  let signed: Record<string, unknown>;
  try {
    signed = await tron.transferTrx({
      fromPrivateKey: treasuryPk,
      toAddress: walletAddress,
      amountTrx,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (tron.isInsufficientTrxBalanceError(message)) {
      const freshBalance = await tron.getTrxBalance(treasuryFromAddress);
      throw new Error(
        formatTreasuryInsufficientForTopUpError(needTrx, freshBalance)
      );
    }
    throw error;
  }
  const txId = tron.getTxId(signed);
  if (!txId) {
    throw new Error("TRX broadcast missing transaction id");
  }

  const sponsoredTrx = parseFloat(
    (existingSponsoredTrx + amountTrx).toFixed(6)
  );
  const topUpTxIds = [...existingTopUpTxIds, txId];
  const persist = {
    sponsorshipMode: FeeSponsorshipMode.trx_topup,
    estimatedTrx: Math.max(estimate.estimatedTrx, neededTrx),
    trxBefore: estimate.trxBalance,
    topUpTxId: txId,
    adminTrxTopUpTxId: txId,
    topUpTxIds,
    sponsoredTrx,
    sponsorRound: 1,
  };
  if (orderKind === "purchase") {
    await persistPurchaseSponsorship(orderId, persist);
  } else {
    await persistWithdrawalSponsorship(orderId, persist);
  }

  return {
    ...base,
    skipped: false,
    topUpTxId: txId,
    amountTrx,
    detail: `TRX top-up from treasury (${amountTrx} TRX)`,
  };
}

/**
 * Fee sponsorship: free user Energy/Bandwidth → else TRX top-up from treasury.
 */
export async function sponsorTransferResources({
  orderKind,
  orderId,
  fromAddress,
  toAddress,
  amountUsdt,
  userId,
  existingSponsoredTrx = 0,
  existingTopUpTxIds = [],
  minEstimatedTrx = 0,
}: {
  orderKind: SponsorshipOrderKind;
  orderId: string;
  fromAddress: string;
  toAddress: string;
  amountUsdt: number;
  userId: string;
  existingSponsoredTrx?: number;
  existingTopUpTxIds?: string[];
  minEstimatedTrx?: number;
}): Promise<SponsorTransferResourcesResult> {
  logSponsor(orderKind, orderId, "start", {
    fromAddress,
    toAddress,
    amountUsdt,
    minEstimatedTrx,
  });

  const estimate = await tron.estimateUsdtTransfer({
    fromAddress,
    toAddress,
    amount: amountUsdt,
  });
  const { targetTrx } = computeTrxTopUpAmount(estimate, minEstimatedTrx);

  if (estimate.canTransferZeroBurn && !(Number(minEstimatedTrx) > 0)) {
    const detail =
      "User has enough Energy/Bandwidth — free transfer (no sponsorship)";
    logSponsor(orderKind, orderId, "user_resources", {
      energyAvailable: estimate.energyAvailable,
      bandwidthAvailable: estimate.bandwidthAvailable,
    });
    const persist = {
      sponsorshipMode: FeeSponsorshipMode.user_resources,
      estimatedTrx: estimate.estimatedTrx,
      trxBefore: estimate.trxBalance,
    };
    if (orderKind === "purchase") {
      await persistPurchaseSponsorship(orderId, persist);
    } else {
      await persistWithdrawalSponsorship(orderId, persist);
    }
    return {
      mode: FeeSponsorshipMode.user_resources,
      skipped: true,
      estimate,
      shortfall: 0,
      energyRentTxId: null,
      bandwidthRentTxId: null,
      energyRentAmountSun: null,
      bandwidthRentAmountSun: null,
      energyTarget: null,
      topUpTxId: null,
      amountTrx: 0,
      targetTrx,
      bufferRatio: TRX_TOPUP_BUFFER_RATIO,
      detail,
    };
  }

  logSponsor(orderKind, orderId, "trx_topup", {
    energyShortfall: estimate.energyShortfall,
    bandwidthShortfall: estimate.bandwidthShortfall,
    minEstimatedTrx,
  });

  return applyTrxTopUp({
    orderKind,
    orderId,
    userId,
    walletAddress: fromAddress,
    estimate,
    existingSponsoredTrx,
    existingTopUpTxIds,
    minEstimatedTrx,
  });
}

/**
 * After USDT: prepare for TRX sweep when top-up was used.
 * Does not perform the sweep itself (existing recoverAdminSponsoredTrx / recoverWithdrawalSponsoredTrx).
 */
export async function finalizeSponsoredResources({
  orderKind,
  orderId,
}: {
  orderKind: SponsorshipOrderKind;
  orderId: string;
}): Promise<FinalizeSponsoredResourcesResult> {
  if (orderKind === "purchase") {
    const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("Purchase order not found");

    const mode = order.sponsorshipMode;
    if (mode === FeeSponsorshipMode.user_resources) {
      return {
        mode,
        energyReturnTxId: null,
        sweepTxId: null,
        recoveredTrx: 0,
        detail: "No sponsored resources to finalize",
      };
    }

    return {
      mode: mode ?? FeeSponsorshipMode.trx_topup,
      energyReturnTxId: null,
      sweepTxId: order.sweepTxId,
      recoveredTrx: order.recoveredTrx || 0,
      detail:
        (order.sponsoredTrx || 0) > 0
          ? "TRX top-up path — recover via sweep step"
          : "No sponsored TRX to recover",
    };
  }

  const order = await prisma.withdrawalOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Withdrawal order not found");

  const mode = order.sponsorshipMode;
  if (mode === FeeSponsorshipMode.user_resources) {
    return {
      mode,
      energyReturnTxId: null,
      sweepTxId: null,
      recoveredTrx: 0,
      detail: "No sponsored resources to finalize",
    };
  }

  return {
    mode: mode ?? FeeSponsorshipMode.trx_topup,
    energyReturnTxId: null,
    sweepTxId: order.sweepTxId,
    recoveredTrx: order.recoveredTrx || 0,
    detail: order.fromTreasury
      ? "Treasury burn path — no TRX sweep"
      : (order.sponsoredTrx || 0) > 0
        ? "TRX top-up path — recover via sweep step"
        : "No sponsored TRX to recover",
  };
}

export function shouldRecoverSponsoredTrx(order: {
  sponsorshipMode?: FeeSponsorshipMode | null;
  sponsoredTrx?: number | null;
  sweepTxId?: string | null;
}): boolean {
  if (order.sweepTxId) return false;
  if ((order.sponsoredTrx || 0) <= 0) return false;
  return (
    !order.sponsorshipMode ||
    order.sponsorshipMode === FeeSponsorshipMode.trx_topup
  );
}
