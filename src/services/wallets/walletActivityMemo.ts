import { getFundById } from "@/lib/config/investmentFunds";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import type { IndieFundrMemo } from "@/lib/tron/transactionMemo";
import {
  getPendingPurchaseOrderTapInfo,
  shouldShowPendingPurchaseOrderTapInfo,
} from "./walletActivityLabels";
import type { WalletActivityTx } from "./walletActivityMerge";
import { getTypicalPayoutDaysForFund } from "@/services/funds/typicalPayoutDays";
import {
  insightsFromPurchaseOrder,
  insightsFromRedemption,
} from "./transactionInsights";
import { linksFromPurchaseOrder } from "./walletOnChainLinks";
import * as tron from "@/services/tron/client";
import {
  buildOrderSettlementView,
  resolvePurchaseOrderActivityDisplayStatus,
} from "@/services/orders/orderSettlementView";
import { isManualFulfillmentOrder } from "@/services/orders/purchaseOrderManual";

const AMOUNT_TOLERANCE = 0.0001;

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

export type MemoClassificationContext = {
  userId: string;
  walletId: string;
  walletAddress: string;
  treasuryAddress: string | null;
  row: {
    txId: string;
    type: "in" | "out";
    amount: number;
    date: Date;
    from: string;
    to: string;
    status: string;
  };
  parsedMemo: IndieFundrMemo;
};

export type MemoClassificationResult = {
  tx: WalletActivityTx;
  healOrderId?: string;
};

export async function classifyChainRowFromMemo(
  ctx: MemoClassificationContext
): Promise<MemoClassificationResult | null> {
  const { parsedMemo, row, userId, walletId, treasuryAddress } = ctx;
  const fund = getFundById(parsedMemo.fundId);
  const fundName = fund?.name || parsedMemo.fundId;
  const tronscanUrl = getTronscanTxUrl(row.txId);

  if (parsedMemo.kind === "invest" || parsedMemo.kind === "topup") {
    if (row.type !== "out") {
      return null;
    }
    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: parsedMemo.entityId,
        userId,
        walletId,
        fundId: parsedMemo.fundId,
      },
    });
    if (!order) {
      return null;
    }
    if (!amountsMatch(row.amount, order.costUsdt)) {
      return null;
    }
    if (treasuryAddress) {
      const toNorm =
        (await tron.normalizeTronAddress(row.to)) ?? row.to;
      const treasuryNorm =
        (await tron.normalizeTronAddress(treasuryAddress)) ?? treasuryAddress;
      if (toNorm !== treasuryNorm) {
        return null;
      }
    }

    const settlement = buildOrderSettlementView(order);
    const linkedInvestment = order.investmentId
      ? await prisma.investment.findFirst({
          where: { id: order.investmentId, userId },
        })
      : null;
    const displayStatus = resolvePurchaseOrderActivityDisplayStatus(
      order,
      settlement,
      linkedInvestment
    );
    const label = displayStatus === "failed"
      ? `Failed investment order (${fundName})`
      : `Investment order (${fundName})`;
    const pendingTapInfo = shouldShowPendingPurchaseOrderTapInfo(
      order,
      displayStatus,
      settlement.phase
    )
      ? getPendingPurchaseOrderTapInfo(order, fundName)
      : null;

    const chainConfirmed =
      row.status === "confirmed" || row.status.toLowerCase() === "success";
    const healOrderId =
      !isManualFulfillmentOrder(order) &&
      chainConfirmed &&
      (order.status === "processing" || order.status === "queued")
        ? order.id
        : undefined;

    const orderLinks = linksFromPurchaseOrder(order);
    const typicalPayoutDays = await getTypicalPayoutDaysForFund(
      order.fundId,
      fund?.termDays ?? 90
    );
    return {
      tx: {
        id: `purchase-order-${order.id}`,
        type: "out",
        source: "app",
        amount: row.amount,
        status: displayStatus,
        label,
        date: row.date,
        txId: row.txId ?? orderLinks.txId,
        tronscanUrl: tronscanUrl ?? orderLinks.tronscanUrl,
        topUpTxId: orderLinks.topUpTxId,
        topUpTronscanUrl: orderLinks.topUpTronscanUrl,
        pendingTapInfo,
        displayStatus,
        settlementPhase: settlement.phase,
        settlementLabel: settlement.settlementLabel,
        insights: insightsFromPurchaseOrder(
          order,
          fund,
          linkedInvestment,
          typicalPayoutDays
        ),
      },
      healOrderId,
    };
  }

  if (parsedMemo.kind === "redeem" || parsedMemo.kind === "payout") {
    if (row.type !== "in") {
      return null;
    }
    const investment = await prisma.investment.findFirst({
      where: {
        id: parsedMemo.entityId,
        userId,
        walletId,
        fundId: parsedMemo.fundId,
      },
    });
    if (!investment) {
      return null;
    }
    if (!amountsMatch(row.amount, investment.projectedPayoutUsdt)) {
      return null;
    }
    if (treasuryAddress) {
      const fromNorm =
        (await tron.normalizeTronAddress(row.from)) ?? row.from;
      const treasuryNorm =
        (await tron.normalizeTronAddress(treasuryAddress)) ?? treasuryAddress;
      if (fromNorm !== treasuryNorm) {
        return null;
      }
    }

    const typicalPayoutDays = await getTypicalPayoutDaysForFund(
      investment.fundId,
      fund?.termDays ?? 90
    );
    return {
      tx: {
        id: `redemption-${investment.id}`,
        type: "in",
        source: "app",
        amount: row.amount,
        status: row.status === "pending" ? "pending" : "confirmed",
        label: `Earnings credited (${fundName})`,
        date: row.date,
        txId: row.txId,
        tronscanUrl,
        insights: insightsFromRedemption(
          investment,
          fund,
          row.amount,
          typicalPayoutDays
        ),
      },
    };
  }

  return null;
}
