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
import * as justlend from "@/services/tron/justlendEnergyRent";
import * as tron from "@/services/tron/client";
import type { UsdtTransferEstimate } from "@/services/tron/client";

/** Keep in sync with purchaseOrderFulfillment.ADMIN_TRX_TOPUP_BUFFER_RATIO */
const TRX_TOPUP_BUFFER_RATIO = 1.5;

function computeTrxTopUpAmount(estimate: {
  estimatedTrx: number;
  trxBalance: number;
}): number {
  const target = parseFloat(
    (estimate.estimatedTrx * TRX_TOPUP_BUFFER_RATIO).toFixed(6)
  );
  return parseFloat(Math.max(0, target - estimate.trxBalance).toFixed(6));
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

const ENERGY_RENT_BUFFER = 1.05;

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

function targetEnergyFromEstimate(estimate: UsdtTransferEstimate): number {
  const need = Math.max(estimate.energyShortfall, 0);
  if (need <= 0) return 0;
  return Math.ceil(need * ENERGY_RENT_BUFFER);
}

async function persistPurchaseSponsorship(
  orderId: string,
  data: {
    sponsorshipMode: FeeSponsorshipMode;
    estimatedTrx: number;
    trxBefore: number;
    energyRentTxId?: string | null;
    energyReturnTxId?: string | null;
    energyRentAmountSun?: string | null;
    energyTarget?: number | null;
    bandwidthRentTxId?: string | null;
    bandwidthRentAmountSun?: string | null;
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
    energyRentTxId?: string | null;
    energyReturnTxId?: string | null;
    energyRentAmountSun?: string | null;
    energyTarget?: number | null;
    bandwidthRentTxId?: string | null;
    bandwidthRentAmountSun?: string | null;
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

async function tryJustLendRent(
  estimate: UsdtTransferEstimate
): Promise<{
  ok: true;
  energyRentTxId: string;
  energyRentAmountSun: string;
  energyTarget: number;
  bandwidthRentTxId: string | null;
  bandwidthRentAmountSun: string | null;
} | { ok: false; error: string }> {
  try {
    const energyTarget = targetEnergyFromEstimate(estimate);
    if (energyTarget <= 0 && estimate.bandwidthShortfall <= 0) {
      return { ok: false, error: "No resource shortfall to rent" };
    }

    let energyRentTxId = "";
    let energyRentAmountSun = "";
    let bandwidthRentTxId: string | null = null;
    let bandwidthRentAmountSun: string | null = null;

    if (energyTarget > 0) {
      const rented = await justlend.rentResourceToAddress({
        receiver: estimate.fromAddress,
        targetEnergy: energyTarget,
        resourceType: justlend.JUSTLEND_RESOURCE_ENERGY,
      });
      energyRentTxId = rented.txId;
      energyRentAmountSun = rented.amountSun;

      await justlend.waitUntilEnergyAvailable({
        address: estimate.fromAddress,
        minEnergy: estimate.energyUsed,
      });
    }

    // Re-check bandwidth after energy rent; free daily quota usually covers it.
    const refreshed = await tron.estimateUsdtTransfer({
      fromAddress: estimate.fromAddress,
      toAddress: estimate.toAddress,
      amount: estimate.amountUsdt,
    });

    if (refreshed.bandwidthShortfall > 0) {
      // JustLend amount is delegated TRX sun (not bandwidth units). Rent min 1 TRX.
      const bwRented = await justlend.rentDelegatedTrxToAddress({
        receiver: estimate.fromAddress,
        amountSun: BigInt(1_000_000),
        resourceType: justlend.JUSTLEND_RESOURCE_BANDWIDTH,
      });
      bandwidthRentTxId = bwRented.txId;
      bandwidthRentAmountSun = bwRented.amountSun;
    }

    return {
      ok: true,
      energyRentTxId,
      energyRentAmountSun,
      energyTarget,
      bandwidthRentTxId,
      bandwidthRentAmountSun,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

async function applyTrxTopUpFallback({
  orderKind,
  orderId,
  userId,
  walletAddress,
  estimate,
  existingSponsoredTrx,
  existingTopUpTxIds,
}: {
  orderKind: SponsorshipOrderKind;
  orderId: string;
  userId: string;
  walletAddress: string;
  estimate: UsdtTransferEstimate;
  existingSponsoredTrx: number;
  existingTopUpTxIds: string[];
}): Promise<SponsorTransferResourcesResult> {
  const treasuryPk = getEnv().treasuryPrivateKey?.trim();
  if (!treasuryPk) {
    throw new Error("Treasury private key is not configured");
  }

  const amountTrx = computeTrxTopUpAmount(estimate);
  const shortfall = feeSponsorship.computeSponsorShortfall(estimate);
  const targetTrx = parseFloat(
    (estimate.estimatedTrx * TRX_TOPUP_BUFFER_RATIO).toFixed(6)
  );
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
      "Wallet has enough TRX to burn fees — skipping top-up (fallback path)";
    const persist = {
      sponsorshipMode: FeeSponsorshipMode.trx_topup,
      estimatedTrx: estimate.estimatedTrx,
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

  const signed = await tron.transferTrx({
    fromPrivateKey: treasuryPk,
    toAddress: walletAddress,
    amountTrx,
  });
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
    estimatedTrx: estimate.estimatedTrx,
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
    detail: `JustLend unavailable — TRX top-up fallback (${amountTrx} TRX)`,
  };
}

/**
 * Cascaded fee sponsorship: user resources → JustLend rent → TRX top-up.
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
}: {
  orderKind: SponsorshipOrderKind;
  orderId: string;
  fromAddress: string;
  toAddress: string;
  amountUsdt: number;
  userId: string;
  existingSponsoredTrx?: number;
  existingTopUpTxIds?: string[];
}): Promise<SponsorTransferResourcesResult> {
  logSponsor(orderKind, orderId, "start", { fromAddress, toAddress, amountUsdt });

  const estimate = await tron.estimateUsdtTransfer({
    fromAddress,
    toAddress,
    amount: amountUsdt,
  });
  const shortfall = feeSponsorship.computeSponsorShortfall(estimate);
  const targetTrx = parseFloat(
    (estimate.estimatedTrx * TRX_TOPUP_BUFFER_RATIO).toFixed(6)
  );

  if (estimate.canTransferZeroBurn) {
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

  if (justlend.isJustLendEnergyRentAvailable()) {
    logSponsor(orderKind, orderId, "justlend_attempt", {
      energyShortfall: estimate.energyShortfall,
      bandwidthShortfall: estimate.bandwidthShortfall,
    });
    const rented = await tryJustLendRent(estimate);
    if (rented.ok) {
      const detail = rented.energyRentTxId
        ? `Energy rented via JustLend (${rented.energyTarget} energy)`
        : "Bandwidth rented via JustLend";
      const persist = {
        sponsorshipMode: FeeSponsorshipMode.justlend_rent,
        estimatedTrx: estimate.estimatedTrx,
        trxBefore: estimate.trxBalance,
        energyRentTxId: rented.energyRentTxId || null,
        energyRentAmountSun: rented.energyRentAmountSun || null,
        energyTarget: rented.energyTarget || null,
        bandwidthRentTxId: rented.bandwidthRentTxId,
        bandwidthRentAmountSun: rented.bandwidthRentAmountSun,
      };
      if (orderKind === "purchase") {
        await persistPurchaseSponsorship(orderId, persist);
      } else {
        await persistWithdrawalSponsorship(orderId, persist);
      }
      logSponsor(orderKind, orderId, "justlend_ok", {
        energyRentTxId: rented.energyRentTxId,
        bandwidthRentTxId: rented.bandwidthRentTxId,
      });
      return {
        mode: FeeSponsorshipMode.justlend_rent,
        skipped: false,
        estimate,
        shortfall,
        energyRentTxId: rented.energyRentTxId || null,
        bandwidthRentTxId: rented.bandwidthRentTxId,
        energyRentAmountSun: rented.energyRentAmountSun || null,
        bandwidthRentAmountSun: rented.bandwidthRentAmountSun,
        energyTarget: rented.energyTarget || null,
        topUpTxId: null,
        amountTrx: 0,
        targetTrx,
        bufferRatio: TRX_TOPUP_BUFFER_RATIO,
        detail,
      };
    }
    logSponsor(orderKind, orderId, "justlend_fail", { error: rented.error });
  } else {
    logSponsor(orderKind, orderId, "justlend_skip", {
      reason: "not available on this network/config",
    });
  }

  return applyTrxTopUpFallback({
    orderKind,
    orderId,
    userId,
    walletAddress: fromAddress,
    estimate,
    existingSponsoredTrx,
    existingTopUpTxIds,
  });
}

async function returnJustLendForOrder({
  orderKind,
  orderId,
  walletAddress,
  energyRentAmountSun,
  bandwidthRentAmountSun,
}: {
  orderKind: SponsorshipOrderKind;
  orderId: string;
  walletAddress: string;
  energyRentAmountSun: string | null;
  bandwidthRentAmountSun: string | null;
}): Promise<string | null> {
  let energyReturnTxId: string | null = null;

  if (energyRentAmountSun && BigInt(energyRentAmountSun) > BigInt(0)) {
    try {
      const returned = await justlend.returnRentedResource({
        receiver: walletAddress,
        amountSun: energyRentAmountSun,
        resourceType: justlend.JUSTLEND_RESOURCE_ENERGY,
      });
      energyReturnTxId = returned.txId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[resource-sponsorship] energy return failed:", message, {
        orderKind,
        orderId,
      });
    }
  }

  if (bandwidthRentAmountSun && BigInt(bandwidthRentAmountSun) > BigInt(0)) {
    try {
      await justlend.returnRentedResource({
        receiver: walletAddress,
        amountSun: bandwidthRentAmountSun,
        resourceType: justlend.JUSTLEND_RESOURCE_BANDWIDTH,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[resource-sponsorship] bandwidth return failed:", message, {
        orderKind,
        orderId,
      });
    }
  }

  if (energyReturnTxId) {
    if (orderKind === "purchase") {
      await prisma.purchaseOrder.update({
        where: { id: orderId },
        data: { energyReturnTxId, updatedAt: new Date() },
      });
    } else {
      await prisma.withdrawalOrder.update({
        where: { id: orderId },
        data: { energyReturnTxId, updatedAt: new Date() },
      });
    }
  }

  return energyReturnTxId;
}

/**
 * After USDT: return JustLend rentals and/or prepare for TRX sweep.
 * Does not perform the sweep itself for purchase (existing recoverAdminSponsoredTrx).
 * For convenience returns whether a TRX recover step is needed.
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
    const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
    if (!wallet?.address) throw new Error("User wallet not found");

    const mode = order.sponsorshipMode;
    if (mode === FeeSponsorshipMode.justlend_rent) {
      const energyReturnTxId = await returnJustLendForOrder({
        orderKind,
        orderId,
        walletAddress: wallet.address,
        energyRentAmountSun: order.energyRentAmountSun,
        bandwidthRentAmountSun: order.bandwidthRentAmountSun,
      });
      return {
        mode,
        energyReturnTxId,
        sweepTxId: null,
        recoveredTrx: 0,
        detail: energyReturnTxId
          ? "JustLend Energy returned to treasury"
          : "JustLend return skipped or failed — check open rentals",
      };
    }

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
  const wallet = await prisma.wallet.findUnique({ where: { id: order.walletId } });
  if (!wallet?.address) throw new Error("User wallet not found");

  const mode = order.sponsorshipMode;
  if (mode === FeeSponsorshipMode.justlend_rent) {
    const energyReturnTxId = await returnJustLendForOrder({
      orderKind,
      orderId,
      walletAddress: wallet.address,
      energyRentAmountSun: order.energyRentAmountSun,
      bandwidthRentAmountSun: order.bandwidthRentAmountSun,
    });
    return {
      mode,
      energyReturnTxId,
      sweepTxId: null,
      recoveredTrx: 0,
      detail: energyReturnTxId
        ? "JustLend Energy returned to treasury"
        : "JustLend return skipped or failed — check open rentals",
    };
  }

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
    mode: mode ?? null,
    energyReturnTxId: null,
    sweepTxId: order.sweepTxId,
    recoveredTrx: order.recoveredTrx || 0,
    detail:
      (order.sponsoredTrx || 0) > 0
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
