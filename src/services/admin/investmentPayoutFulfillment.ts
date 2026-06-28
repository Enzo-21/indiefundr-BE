import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  Prisma,
  TreasuryEventType,
  type Investment,
} from "@prisma/client";
import { isExcludedFromNormalPayout } from "@/lib/investments/referralRecoveryNormalPayout";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getTronscanTxUrl, getMainWallet } from "@/lib/wallets/helpers";
import {
  creditSurplus,
  drawSurplus,
  getLedgerSnapshot,
} from "@/services/revenueEngine/ledger";
import {
  buildSurplusPayoutClaimWhere,
  computeFifoSurplusEligibleInvestmentIds,
  getSurplusPayoutEligibilityWithFifo,
  isSurplusPayoutTrigger,
  type PayoutTrigger,
} from "@/services/revenueEngine/payoutScheduler";
import {
  buildIndieFundrMemo,
  isIndieFundrChainMemoEnabled,
} from "@/lib/tron/transactionMemo";
import {
  formatInvestmentAutopilotManualCheckReason,
  appendAutopilotNote,
} from "@/lib/admin/autopilotBatch";
import type { AdminFulfillmentEstimate } from "@/services/admin/purchaseOrderFulfillment";
import { formatTronTransferError } from "@/lib/utils/tronErrors";
import * as tron from "@/services/tron/client";

export type InvestmentPayoutMode = "normal" | "surplus";

export type InvestmentPayoutFulfillmentEstimate = AdminFulfillmentEstimate & {
  treasuryUsdtBalance: number;
  treasuryTrxBalance: number;
  ledgerTreasurySurplus: number;
  ledgerPoolAvailable: number;
  canTransfer: boolean;
};

function getTreasuryPrivateKey(): string {
  const pk = getEnv().treasuryPrivateKey?.trim();
  if (!pk) {
    throw new Error("Treasury private key is not configured");
  }
  return pk;
}

function formatInvestmentTreasuryPreflightError(
  estimate: tron.UsdtTransferEstimate,
  treasuryAddress: string,
  amountUsdt: number,
  snapshot: Awaited<ReturnType<typeof getLedgerSnapshot>>
): string {
  const formatted = formatTronTransferError(
    estimate.hasEnoughUsdt ? "insufficient trx for fees" : "insufficient usdt",
    {
      fromAddress: treasuryAddress,
      trxBalance: estimate.trxBalance,
      usdtBalance: estimate.usdtBalance,
      amountUsdt,
      estimatedTrx: estimate.estimatedTrx,
    }
  );
  const base =
    typeof formatted.msg === "string"
      ? formatted.msg
      : "Treasury cannot cover this investment payout";
  const ledgerHint =
    amountUsdt <= snapshot.treasurySurplus ||
    amountUsdt <= snapshot.poolAvailable
      ? ` Ledger shows sufficient funds (surplus ${snapshot.treasurySurplus}, pool ${snapshot.poolAvailable}) but on-chain treasury USDT is ${estimate.usdtBalance}.`
      : "";
  return `${base}${ledgerHint}`;
}

async function assertInvestmentPayoutBroadcastReady(
  investment: Investment,
  toAddress: string
): Promise<{ treasuryAddress: string; estimate: tron.UsdtTransferEstimate }> {
  if (!(await tron.validateAddress(toAddress))) {
    throw new Error("User wallet address is invalid");
  }

  const treasuryPk = getTreasuryPrivateKey();
  const treasuryAddress = await tron.privateKeyToAddress(treasuryPk);
  const snapshot = await getLedgerSnapshot();

  const estimate = await tron.estimateUsdtTransfer({
    fromAddress: treasuryAddress,
    toAddress,
    amount: investment.projectedPayoutUsdt,
  });

  if (!estimate.canTransfer) {
    throw new Error(
      formatInvestmentTreasuryPreflightError(
        estimate,
        treasuryAddress,
        investment.projectedPayoutUsdt,
        snapshot
      )
    );
  }

  return { treasuryAddress, estimate };
}

export async function getInvestmentPayoutFulfillmentEstimate(
  investmentId: string
): Promise<InvestmentPayoutFulfillmentEstimate> {
  const investment = await loadInvestmentOrThrow(investmentId);
  const receiverAddress = await assertPayoutWalletReady(investment.userId);

  const treasuryPk = getTreasuryPrivateKey();
  const treasuryAddress = await tron.privateKeyToAddress(treasuryPk);
  const snapshot = await getLedgerSnapshot();

  const feeEstimate = await tron.estimateUsdtTransfer({
    fromAddress: treasuryAddress,
    toAddress: receiverAddress,
    amount: investment.projectedPayoutUsdt,
  });

  const shortfall = Math.max(
    0,
    parseFloat((feeEstimate.estimatedTrx - feeEstimate.trxBalance).toFixed(6))
  );

  return {
    estimatedTrx: feeEstimate.estimatedTrx,
    trxBalance: feeEstimate.trxBalance,
    shortfall,
    hasEnoughTrx: feeEstimate.hasEnoughTrx,
    hasEnoughUsdt: feeEstimate.hasEnoughUsdt,
    costUsdt: investment.projectedPayoutUsdt,
    treasuryUsdtBalance: feeEstimate.usdtBalance,
    treasuryTrxBalance: feeEstimate.trxBalance,
    ledgerTreasurySurplus: snapshot.treasurySurplus,
    ledgerPoolAvailable: snapshot.poolAvailable,
    canTransfer: feeEstimate.canTransfer,
  };
}

export async function resetInvestmentPayoutUsdtForRetry(
  investmentId: string,
  options: { appendNote?: string } = {}
): Promise<void> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
  });
  if (!investment) {
    throw new Error("Investment not found");
  }
  if (investment.status !== InvestmentStatus.redeeming) {
    throw new Error("Investment is not in redeeming status");
  }

  await prisma.investment.update({
    where: { id: investmentId },
    data: {
      redemptionTransaction: null,
      payoutFailureReason: options.appendNote
        ? appendAutopilotNote(
            investment.payoutFailureReason,
            options.appendNote
          )
        : null,
    },
  });
}


export type InvestmentPayoutWorkflowSeed = {
  status: InvestmentStatus;
  payoutTriggeredBy: string | null;
  payoutFailureReason: string | null;
  redemptionTxId: string | null;
  redemptionTronscanUrl: string | null;
  surplusDrawn: boolean;
  mode: InvestmentPayoutMode | null;
};

const PAYOUT_CANDIDATE_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.active,
  InvestmentStatus.matured,
];

type SurplusLiquidityTrigger = Extract<
  PayoutTrigger,
  | "admin_surplus"
  | "cron_surplus"
  | "admin_surplus_liquidity"
  | "cron_surplus_liquidity"
>;

async function loadInvestmentOrThrow(investmentId: string): Promise<Investment> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
  });
  if (!investment) {
    throw new Error("Investment not found");
  }
  return investment;
}

async function assertPayoutWalletReady(userId: string): Promise<string> {
  const receiverWallet = await getMainWallet(userId);
  if (!receiverWallet) {
    throw new Error("Wallet not found");
  }
  const treasuryPk = getEnv().treasuryPrivateKey;
  if (!treasuryPk) {
    throw new Error("Treasury wallet is not configured");
  }
  if (!(await tron.validateAddress(receiverWallet.address))) {
    throw new Error("User wallet address is invalid");
  }
  return receiverWallet.address;
}

async function hasSurplusDrawForInvestment(
  investmentId: string
): Promise<boolean> {
  const event = await prisma.treasuryEvent.findFirst({
    where: {
      investmentId,
      type: TreasuryEventType.surplus_draw,
    },
    select: { id: true },
  });
  return Boolean(event);
}

async function reconcileInvestmentRedemptionForSeed(
  investmentId: string,
  investment: {
    status: InvestmentStatus;
    payoutFailureReason: string | null;
    redemptionTransaction: unknown;
  }
): Promise<{
  redemptionTxId: string | null;
  payoutFailureReason: string | null;
}> {
  const redemptionTxId = tron.getTxId(
    investment.redemptionTransaction as Record<string, unknown> | null
  );
  if (
    !redemptionTxId ||
    investment.status !== InvestmentStatus.redeeming
  ) {
    return {
      redemptionTxId,
      payoutFailureReason: investment.payoutFailureReason,
    };
  }

  const inspection = await tron.inspectTransactionOnChain(redemptionTxId);
  if (inspection.usdtTransferSuccessful || inspection.status === "pending") {
    return {
      redemptionTxId,
      payoutFailureReason: investment.payoutFailureReason,
    };
  }

  if (inspection.status === "failed") {
    const failure = await tron.getTransactionFailureReason(redemptionTxId);
    await resetInvestmentPayoutUsdtForRetry(investmentId, {
      appendNote:
        "Previous USDT broadcast failed on-chain; cleared tx id for retry",
    });
    return {
      redemptionTxId: null,
      payoutFailureReason:
        failure.message ||
        "Previous USDT payment failed on-chain; retry when treasury is funded.",
    };
  }

  return {
    redemptionTxId,
    payoutFailureReason: investment.payoutFailureReason,
  };
}

export async function getInvestmentPayoutWorkflowSeed(
  investmentId: string
): Promise<InvestmentPayoutWorkflowSeed> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: {
      status: true,
      payoutTriggeredBy: true,
      payoutFailureReason: true,
      redemptionTransaction: true,
    },
  });

  if (!investment) {
    throw new Error("Investment not found");
  }

  const reconciled = await reconcileInvestmentRedemptionForSeed(
    investmentId,
    investment
  );
  const surplusDrawn = await hasSurplusDrawForInvestment(investmentId);
  const mode: InvestmentPayoutMode | null = isSurplusPayoutTrigger(
    investment.payoutTriggeredBy
  )
    ? "surplus"
    : investment.payoutTriggeredBy === "admin"
      ? "normal"
      : null;

  return {
    status: investment.status,
    payoutTriggeredBy: investment.payoutTriggeredBy,
    payoutFailureReason: reconciled.payoutFailureReason,
    redemptionTxId: reconciled.redemptionTxId,
    redemptionTronscanUrl: reconciled.redemptionTxId
      ? getTronscanTxUrl(reconciled.redemptionTxId)
      : null,
    surplusDrawn,
    mode,
  };
}

export async function validateNormalPayoutEligibility(
  investmentId: string
): Promise<{ investment: Investment }> {
  const investment = await loadInvestmentOrThrow(investmentId);

  if (investment.status === InvestmentStatus.redeemed) {
    throw new Error("Investment is already paid");
  }

  if (
    investment.status === InvestmentStatus.redeeming &&
    !investment.payoutFailureReason
  ) {
    return { investment };
  }

  if (!PAYOUT_CANDIDATE_STATUSES.includes(investment.status)) {
    throw new Error("Investment is not payable");
  }

  if (isExcludedFromNormalPayout(investment)) {
    throw new Error(
      "Investment is on the referral recovery path; principal is paid only after two qualified invites"
    );
  }

  if (!investment.payoutUnlockedAt) {
    throw new Error("Investment is not unlocked for payout");
  }

  await assertPayoutWalletReady(investment.userId);
  return { investment };
}

export async function validateSurplusPayoutEligibility(
  investmentId: string,
  { now = new Date() }: { now?: Date } = {}
): Promise<{ investment: Investment }> {
  const investment = await loadInvestmentOrThrow(investmentId);

  if (investment.status === InvestmentStatus.redeemed) {
    throw new Error("Investment is already paid");
  }

  if (isExcludedFromNormalPayout(investment)) {
    throw new Error(
      "Investment is on the referral recovery path; principal is paid only after two qualified invites"
    );
  }

  if (
    investment.status === InvestmentStatus.redeeming &&
    !investment.payoutFailureReason
  ) {
    return { investment };
  }

  const ledger = await getLedgerSnapshot();
  const fifoCandidates = await prisma.investment.findMany({
    where: {
      status: { in: PAYOUT_CANDIDATE_STATUSES },
      subscribedAt: { not: null },
    },
    orderBy: [{ subscribedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      subscribedAt: true,
      status: true,
      projectedPayoutUsdt: true,
      payoutUnlockedAt: true,
      redemptionTransaction: true,
      maturesAt: true,
      unpaidMaturityResolution: true,
      referralRecoveryCompletedAt: true,
    },
  });
  const fifoEligibleIds = computeFifoSurplusEligibleInvestmentIds(
    fifoCandidates,
    ledger,
    now
  );

  if (!fifoEligibleIds.has(investmentId)) {
    const eligibility = getSurplusPayoutEligibilityWithFifo(
      investment,
      ledger,
      fifoEligibleIds,
      now
    );
    if (eligibility.reason === "insufficient_surplus") {
      throw new Error(
        `Insufficient treasury surplus: short ${eligibility.surplusShortfallUsdt} USDT`
      );
    }
    if (eligibility.reason === "fifo_surplus_blocked") {
      throw new Error(
        "Investment is not eligible for surplus payout: earlier investments reserve available surplus (FIFO)"
      );
    }
    if (eligibility.reason === "normal_payout_unlocked") {
      throw new Error(
        "Investment is unlocked for normal payout; use Pay now instead of surplus"
      );
    }
    throw new Error(
      `Investment is not eligible for surplus payout: ${eligibility.reason}`
    );
  }

  await assertPayoutWalletReady(investment.userId);
  return { investment };
}

export async function claimNormalPayout(
  investmentId: string,
  trigger: PayoutTrigger = "admin"
): Promise<{ investment: Investment; alreadyClaimed: boolean }> {
  const investment = await loadInvestmentOrThrow(investmentId);

  if (investment.status === InvestmentStatus.redeemed) {
    return { investment, alreadyClaimed: true };
  }

  if (investment.status === InvestmentStatus.redeeming) {
    return { investment, alreadyClaimed: true };
  }

  await validateNormalPayoutEligibility(investmentId);

  const claimed = await prisma.investment.updateMany({
    where: {
      id: investment.id,
      status: { in: PAYOUT_CANDIDATE_STATUSES },
    },
    data: {
      status: InvestmentStatus.redeeming,
      payoutTriggeredBy: trigger,
      payoutFailureReason: null,
    },
  });

  if (claimed.count !== 1) {
    const current = await prisma.investment.findUniqueOrThrow({
      where: { id: investment.id },
    });
    return { investment: current, alreadyClaimed: true };
  }

  const updated = await prisma.investment.findUniqueOrThrow({
    where: { id: investment.id },
  });
  return { investment: updated, alreadyClaimed: false };
}

export async function prepareSurplusPayout(
  investmentId: string,
  trigger: SurplusLiquidityTrigger = "admin_surplus_liquidity"
): Promise<{ investment: Investment; alreadyPrepared: boolean }> {
  const investment = await loadInvestmentOrThrow(investmentId);

  if (investment.status === InvestmentStatus.redeemed) {
    return { investment, alreadyPrepared: true };
  }

  const surplusDrawn = await hasSurplusDrawForInvestment(investmentId);
  if (investment.status === InvestmentStatus.redeeming && surplusDrawn) {
    return { investment, alreadyPrepared: true };
  }

  if (investment.status !== InvestmentStatus.redeeming) {
    await validateSurplusPayoutEligibility(investmentId);

    const claimed = await prisma.investment.updateMany({
      where: buildSurplusPayoutClaimWhere(investment.id),
      data: {
        status: InvestmentStatus.redeeming,
        payoutTriggeredBy: trigger,
        payoutFailureReason: null,
        payoutReason:
          "Paid from treasury surplus (FIFO liquidity) when surplus covered the projected payout.",
      },
    });

    if (claimed.count !== 1) {
      const current = await prisma.investment.findUniqueOrThrow({
        where: { id: investment.id },
      });
      if (current.status === InvestmentStatus.redeeming) {
        const drawn = await hasSurplusDrawForInvestment(investmentId);
        if (drawn) {
          return { investment: current, alreadyPrepared: true };
        }
      } else {
        throw new Error("Could not start surplus payout");
      }
    }
  }

  const current = await prisma.investment.findUniqueOrThrow({
    where: { id: investmentId },
  });

  if (!(await hasSurplusDrawForInvestment(investmentId))) {
    await drawSurplus(current.projectedPayoutUsdt, current, {
      reason: "surplus_liquidity_payout",
      trigger,
      maturesAt: current.maturesAt?.toISOString(),
    });
  }

  const updated = await prisma.investment.findUniqueOrThrow({
    where: { id: investmentId },
  });
  return { investment: updated, alreadyPrepared: false };
}

export async function broadcastInvestmentPayoutUsdt(
  investmentId: string
): Promise<{
  investment: Investment;
  txId: string;
  tronscanUrl: string;
  alreadyBroadcast: boolean;
}> {
  let investment = await loadInvestmentOrThrow(investmentId);

  if (investment.status === InvestmentStatus.redeemed) {
    const txId =
      tron.getTxId(
        investment.redemptionTransaction as Record<string, unknown> | null
      ) ?? "";
    return {
      investment,
      txId,
      tronscanUrl: txId ? getTronscanTxUrl(txId) : "",
      alreadyBroadcast: true,
    };
  }

  if (investment.status !== InvestmentStatus.redeeming) {
    throw new Error("Investment must be in redeeming status before broadcast");
  }

  const existingTxId = tron.getTxId(
    investment.redemptionTransaction as Record<string, unknown> | null
  );
  if (existingTxId) {
    const inspection = await tron.inspectTransactionOnChain(existingTxId);
    if (inspection.usdtTransferSuccessful) {
      return {
        investment,
        txId: existingTxId,
        tronscanUrl: getTronscanTxUrl(existingTxId),
        alreadyBroadcast: true,
      };
    }
    if (inspection.status === "pending") {
      return {
        investment,
        txId: existingTxId,
        tronscanUrl: getTronscanTxUrl(existingTxId),
        alreadyBroadcast: true,
      };
    }
    if (inspection.status === "failed") {
      await resetInvestmentPayoutUsdtForRetry(investmentId, {
        appendNote:
          "Previous USDT broadcast failed on-chain; cleared tx id for retry",
      });
      investment = await loadInvestmentOrThrow(investmentId);
    }
  }

  const receiverAddress = await assertPayoutWalletReady(investment.userId);
  await assertInvestmentPayoutBroadcastReady(investment, receiverAddress);
  const treasuryPk = getTreasuryPrivateKey();

  const chainMemo = isIndieFundrChainMemoEnabled()
    ? buildIndieFundrMemo({
        kind: "redeem",
        fundId: investment.fundId,
        entityId: investment.id,
      })
    : undefined;

  const revertStatus =
    investment.maturesAt && investment.maturesAt <= new Date()
      ? InvestmentStatus.matured
      : InvestmentStatus.active;

  try {
    const signedTransaction = await tron.transferUsdt({
      fromPrivateKey: treasuryPk,
      toAddress: receiverAddress,
      amount: investment.projectedPayoutUsdt,
      memo: chainMemo,
    });

    const txId = tron.getTxId(signedTransaction as Record<string, unknown>);
    if (!txId) {
      throw new Error("Broadcast succeeded but transaction id is missing");
    }

    const updated = await prisma.investment.update({
      where: { id: investment.id },
      data: {
        redemptionTransaction: signedTransaction as Prisma.InputJsonValue,
        chainMemo: chainMemo ?? undefined,
        payabilityStatus: InvestmentPayabilityStatus.not_matured,
        payoutFailureReason: null,
      },
    });

    return {
      investment: updated,
      txId,
      tronscanUrl: getTronscanTxUrl(txId),
      alreadyBroadcast: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isSurplusPayoutTrigger(investment.payoutTriggeredBy)) {
      const drawn = await hasSurplusDrawForInvestment(investmentId);
      if (drawn) {
        await creditSurplus(investment.projectedPayoutUsdt, investment, {
          reason: "surplus_payout_broadcast_failed",
          trigger: investment.payoutTriggeredBy,
          error: message,
        });
      }
    }

    await prisma.investment.update({
      where: { id: investment.id },
      data: {
        status: revertStatus,
        payabilityStatus: investment.payoutUnlockedAt
          ? InvestmentPayabilityStatus.payable
          : InvestmentPayabilityStatus.pending_liquidity,
        payoutFailureReason: message,
      },
    });
    throw error;
  }
}

export async function validateInvestmentPayout(
  investmentId: string,
  mode: InvestmentPayoutMode
) {
  if (mode === "normal") {
    return validateNormalPayoutEligibility(investmentId);
  }
  return validateSurplusPayoutEligibility(investmentId);
}

export async function prepareInvestmentPayout(
  investmentId: string,
  mode: InvestmentPayoutMode
) {
  if (mode === "normal") {
    const result = await claimNormalPayout(investmentId, "admin");
    return {
      investment: result.investment,
      alreadyPrepared: result.alreadyClaimed,
    };
  }
  return prepareSurplusPayout(investmentId, "admin_surplus_liquidity");
}

export async function markInvestmentAutopilotManualCheck(
  investmentId: string,
  error: string,
  _adminEmail: string
): Promise<void> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: { id: true, payoutFailureReason: true },
  });
  if (!investment) {
    throw new Error("Investment not found");
  }
  if (investment.payoutFailureReason?.trim()) {
    return;
  }
  await prisma.investment.update({
    where: { id: investmentId },
    data: {
      payoutFailureReason: formatInvestmentAutopilotManualCheckReason(error),
    },
  });
}
