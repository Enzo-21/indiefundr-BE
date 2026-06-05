import {
  InvestmentStatus,
  PurchaseOrderStatus,
  type Investment,
} from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import { getEnv } from "@/lib/env";
import { uiSnapshotLog } from "@/lib/uiSnapshotLog";
import { getUserStatusLabel } from "@/lib/investments/presentation";
import { serializePortfolioMainWallet } from "@/lib/serializers/wallet";
import { getMainWallet, getTronscanTxUrl } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import * as tron from "@/services/tron/client";
import {
  type WalletActivationSyncStatus,
  recordWalletActivatedIfOnChain,
  syncWalletActivationStatus,
} from "@/services/tron/walletActivation";
import { countSettlementPendingFromDb } from "@/lib/wallets/settlementPending";
import { settlementTraceLog } from "@/lib/settlementTraceLog";
import {
  ACTIVE_PURCHASE_ORDER_STATUSES,
  ACTIVE_WITHDRAWAL_ORDER_STATUSES,
} from "./walletBalance";
import { buildWithdrawalOrderSettlementView } from "@/services/orders/withdrawalOrderSettlementView";

const ACTIVE_STATUSES = ACTIVE_PURCHASE_ORDER_STATUSES;
import {
  buildOrderSettlementView,
  deriveOrderSettlementPhaseFromDb,
} from "@/services/orders/orderSettlementView";
import { ensureUserHasWallet } from "./ensureDefaultWallet";
import { runWalletSyncInBackground } from "./walletSyncInFlight";
import {
  getCachedWalletBalances,
  isWalletBalanceCacheFresh,
  syncWallet,
} from "./walletSyncService";

export type WalletSetupStatus = "ready" | "failed";

export function isPortfolioLightPoll(pollSource?: string): boolean {
  return pollSource === "home-pending";
}

export function emptyPortfolio(walletSetupStatus: WalletSetupStatus) {
  return {
    mainWallet: null,
    walletSetupStatus,
    onChainUsdt: 0,
    pendingInboundUsdt: 0,
    totalBalance: 0,
    investedBalance: 0,
    availableUsdt: 0,
    breakdown: {
      pendingOrders: 0,
      pendingInvestments: 0,
      activeInvestments: 0,
      maturedAwaitingClaim: 0,
    },
    needsOnChainSettlement: false,
    byFund: [] as ByFundRow[],
    activePurchaseOrders: [] as Array<{
      orderId: string;
      fundId: string;
      status: string;
      step: string;
      costUsdt: number;
      settlementPhase?: string;
      displayStatus?: string;
      settlementLabel?: string;
    }>,
    activePurchaseOrder: null,
    activeWithdrawalOrders: [] as Array<{
      orderId: string;
      status: string;
      step: string;
      amountUsdt: number;
      destinationAddress: string;
      settlementPhase?: string;
      displayStatus?: string;
      settlementLabel?: string;
    }>,
  };
}

const LOCKED_INVESTMENT_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.pending,
  InvestmentStatus.active,
  InvestmentStatus.matured,
  InvestmentStatus.redeeming,
];

type ByFundRow = {
  fundId: string;
  fundName: string;
  amountUsdt: number;
  status: string;
  statusLabel: string;
  percentOfInvested?: number;
};

function buildByFundAllocation(
  activeOrders: Array<{
    fundId: string;
    costUsdt: number;
    reservedUsdt: number;
  }>,
  investments: Investment[],
  settledInvestedBalance: number
): ByFundRow[] {
  const rows: ByFundRow[] = [];
  const fundsWithActiveOrder = new Set(activeOrders.map((order) => order.fundId));

  for (const order of activeOrders) {
    const fund = getFundById(order.fundId);
    rows.push({
      fundId: order.fundId,
      fundName: fund?.name || order.fundId,
      amountUsdt: parseFloat(
        Number(order.costUsdt || order.reservedUsdt || 0).toFixed(4)
      ),
      status: "pending",
      statusLabel: "Processing",
    });
  }

  for (const inv of investments) {
    if (inv.status === "pending" && fundsWithActiveOrder.has(inv.fundId)) {
      continue;
    }
    if (inv.status === "pending") {
      const fund = getFundById(inv.fundId);
      rows.push({
        fundId: inv.fundId,
        fundName: fund?.name || inv.fundId,
        amountUsdt: parseFloat(Number(inv.amountUsdt || 0).toFixed(4)),
        status: "pending",
        statusLabel: "Processing",
      });
      continue;
    }

    const fund = getFundById(inv.fundId);
    rows.push({
      fundId: inv.fundId,
      fundName: fund?.name || inv.fundId,
      amountUsdt: parseFloat(Number(inv.amountUsdt || 0).toFixed(4)),
      status: inv.status,
      statusLabel: getUserStatusLabel(inv),
    });
  }

  rows.sort((a, b) => b.amountUsdt - a.amountUsdt);

  return rows.map((row) => ({
    ...row,
    percentOfInvested:
      settledInvestedBalance > 0
        ? Math.round((row.amountUsdt / settledInvestedBalance) * 100)
        : 0,
  }));
}

const activeOrderIdSet = (
  activeOrders: Array<{ id?: string }>
): Set<string> => new Set(activeOrders.map((order) => String(order.id ?? "")));

function activeOrderAmount(order: {
  costUsdt?: number;
  reservedUsdt?: number | null;
}): number {
  return Number(order.costUsdt || order.reservedUsdt || 0);
}

function orderUsdtBroadcast(order: { usdtTxId?: string | null }): boolean {
  return Boolean(order.usdtTxId?.trim());
}

export type SettledUnactivatedOrder = {
  id: string;
  costUsdt?: number;
  reservedUsdt?: number | null;
  investmentId?: string | null;
};

/** Exported for unit tests — invested breakdown without double-counting in-flight orders. */
export function computeInvestedBreakdown(
  activeOrders: Array<{
    id?: string;
    costUsdt?: number;
    reservedUsdt?: number | null;
    usdtTxId?: string | null;
  }>,
  investments: Investment[],
  settledUnactivatedOrders: SettledUnactivatedOrder[] = []
): {
  pendingOrdersInvested: number;
  pendingInvestments: number;
  activeInvestments: number;
  maturedAwaitingClaim: number;
  investedBalance: number;
} {
  const linkedActiveOrderIds = activeOrderIdSet(activeOrders);
  const activeOrderById = new Map(
    activeOrders.map((order) => [String(order.id ?? ""), order])
  );

  const pendingOrdersInvested = activeOrders.reduce((sum, order) => {
    if (orderUsdtBroadcast(order)) {
      return sum;
    }
    return sum + activeOrderAmount(order);
  }, 0);

  let activeInvestments = 0;
  let maturedAwaitingClaim = 0;
  let pendingInvestments = 0;

  for (const inv of investments) {
    const principal = Number(inv.amountUsdt) || 0;
    if (inv.status === "pending") {
      if (inv.purchaseOrderId) {
        const orderId = String(inv.purchaseOrderId);
        if (linkedActiveOrderIds.has(orderId)) {
          const order = activeOrderById.get(orderId);
          if (order && orderUsdtBroadcast(order)) {
            pendingInvestments += principal;
          }
          continue;
        }
      }
      pendingInvestments += principal;
      continue;
    }
    if (inv.status === "matured") {
      maturedAwaitingClaim += principal;
    } else {
      activeInvestments += principal;
    }
  }

  const countedOrderIds = new Set(linkedActiveOrderIds);
  for (const order of settledUnactivatedOrders) {
    const orderId = String(order.id);
    if (countedOrderIds.has(orderId)) {
      continue;
    }

    const pendingInv = investments.find(
      (inv) =>
        inv.status === "pending" &&
        inv.purchaseOrderId &&
        String(inv.purchaseOrderId) === orderId
    );
    if (pendingInv) {
      continue;
    }

    if (order.investmentId) {
      const linked = investments.find(
        (inv) => String(inv.id) === String(order.investmentId)
      );
      if (linked && linked.status !== "pending") {
        continue;
      }
    }

    pendingInvestments += activeOrderAmount(order);
    countedOrderIds.add(orderId);
  }

  for (const order of activeOrders) {
    if (!orderUsdtBroadcast(order)) {
      continue;
    }
    const orderId = String(order.id ?? "");
    const linkedPending = investments.some(
      (inv) =>
        inv.status === "pending" &&
        inv.purchaseOrderId &&
        String(inv.purchaseOrderId) === orderId
    );
    if (linkedPending) {
      continue;
    }
    pendingInvestments += activeOrderAmount(order);
    countedOrderIds.add(orderId);
  }

  const investedBalance = parseFloat(
    (
      pendingOrdersInvested +
      pendingInvestments +
      activeInvestments +
      maturedAwaitingClaim
    ).toFixed(4)
  );

  return {
    pendingOrdersInvested,
    pendingInvestments,
    activeInvestments,
    maturedAwaitingClaim,
    investedBalance,
  };
}

export async function getInvestmentPortfolio(
  userId: string,
  { pollSource }: { pollSource?: string } = {}
) {
  let mainWallet = await getMainWallet(userId);

  if (!mainWallet) {
    await ensureUserHasWallet(userId);
    mainWallet = await getMainWallet(userId);
    if (!mainWallet) {
      return emptyPortfolio("failed");
    }
  }

  let activationStatus: WalletActivationSyncStatus = mainWallet.activatedAt
    ? "ready"
    : "pending";
  let activationTxId = mainWallet.activationTxId;

  if (!getEnv().walletActivationEnabled) {
    activationStatus = "ready";
    activationTxId = await recordWalletActivatedIfOnChain(mainWallet);
    const refreshed = await getMainWallet(userId);
    if (refreshed) {
      mainWallet = refreshed;
      activationTxId = refreshed.activationTxId ?? activationTxId;
    }
  } else if (!mainWallet.activatedAt) {
    const sync = await syncWalletActivationStatus(mainWallet);
    activationStatus = sync.status;
    activationTxId = sync.txId;
    const refreshed = await getMainWallet(userId);
    if (refreshed) {
      mainWallet = refreshed;
    }
  }

  const tronscanActivationUrl = activationTxId
    ? getTronscanTxUrl(activationTxId)
    : null;

  const balanceStale = !isWalletBalanceCacheFresh(mainWallet.onChainUsdtCachedAt);

  if (balanceStale || isActivityStaleForPortfolio(mainWallet.activitySyncedAt)) {
    const syncReason = pollSource ?? "portfolio_read";
    void runWalletSyncInBackground(userId, mainWallet.id, syncReason, () =>
      syncWallet(userId, mainWallet.id, { reason: syncReason })
    );
  }

  const { onChainUsdt, pendingInboundUsdt } =
    await getCachedWalletBalances(mainWallet);
  const totalBalance = parseFloat(onChainUsdt.toFixed(4));

  const [activeOrders, activeWithdrawals] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { userId, status: { in: ACTIVE_STATUSES } },
      orderBy: { date: "desc" },
    }),
    prisma.withdrawalOrder.findMany({
      where: { userId, status: { in: ACTIVE_WITHDRAWAL_ORDER_STATUSES } },
      orderBy: { date: "desc" },
    }),
  ]);

  const pendingWithdrawalsReserved = activeWithdrawals.reduce(
    (sum, row) => sum + (row.reservedUsdt || 0),
    0
  );

  const investments = await prisma.investment.findMany({
    where: {
      userId,
      status: { in: LOCKED_INVESTMENT_STATUSES },
    },
  });

  const settledUnactivatedOrders = await prisma.purchaseOrder.findMany({
    where: {
      userId,
      usdtTxId: { not: null },
      status: { not: PurchaseOrderStatus.completed },
      OR: [
        { paymentChainOutcome: "success" },
        {
          status: PurchaseOrderStatus.failed,
          paymentChainFinal: true,
        },
        { paymentChainOutcome: null },
      ],
    },
    select: {
      id: true,
      costUsdt: true,
      reservedUsdt: true,
      investmentId: true,
    },
  });

  const {
    pendingOrdersInvested,
    pendingInvestments,
    activeInvestments,
    maturedAwaitingClaim,
    investedBalance,
  } = computeInvestedBreakdown(
    activeOrders,
    investments,
    settledUnactivatedOrders
  );
  const settledInvestedBalance = parseFloat(
    (activeInvestments + maturedAwaitingClaim).toFixed(4)
  );

  const settlementCandidates = await prisma.purchaseOrder.findMany({
    where: {
      userId,
      paymentChainFinal: false,
      status: {
        in: [PurchaseOrderStatus.processing, PurchaseOrderStatus.failed],
      },
      OR: [
        { usdtTxId: { not: null } },
        { failedUsdtTxIds: { isEmpty: false } },
      ],
    },
  });

  const settlementPending = countSettlementPendingFromDb(settlementCandidates);

  for (const order of [...activeOrders, ...settlementCandidates]) {
    const phase = deriveOrderSettlementPhaseFromDb(order);
    settlementTraceLog("portfolio_poll", {
      pollSource: pollSource ?? null,
      orderId: order.id,
      step: order.step,
      dbStatus: order.status,
      paymentChainOutcome: order.paymentChainOutcome,
      phase,
    });
  }

  const availableUsdt = parseFloat(
    Math.max(
      0,
      onChainUsdt -
        pendingOrdersInvested -
        pendingWithdrawalsReserved -
        pendingInboundUsdt
    ).toFixed(4)
  );

  const activePurchaseOrders = activeOrders.map((order) => {
    const settlement = buildOrderSettlementView(order);
    return {
      orderId: order.id,
      fundId: order.fundId,
      status: order.status,
      step: order.step,
      costUsdt: order.costUsdt,
      settlementPhase: settlement.phase,
      displayStatus: settlement.displayStatus,
      settlementLabel: settlement.settlementLabel,
    };
  });

  const byFund = buildByFundAllocation(
    activeOrders,
    investments,
    settledInvestedBalance
  );

  const serializedMainWallet = serializePortfolioMainWallet(mainWallet, {
    activationStatus,
    tronscanActivationUrl,
  });

  const activeWithdrawalOrders = activeWithdrawals.map((order) => {
    const settlement = buildWithdrawalOrderSettlementView(order);
    return {
      orderId: order.id,
      status: order.status,
      step: order.step,
      amountUsdt: order.amountUsdt,
      destinationAddress: order.destinationAddress,
      settlementPhase: settlement.phase,
      displayStatus: settlement.displayStatus,
      settlementLabel: settlement.settlementLabel,
    };
  });

  const breakdown = {
    pendingOrders: parseFloat(pendingOrdersInvested.toFixed(4)),
    pendingWithdrawals: parseFloat(pendingWithdrawalsReserved.toFixed(4)),
    pendingInvestments: parseFloat(pendingInvestments.toFixed(4)),
    activeInvestments: parseFloat(activeInvestments.toFixed(4)),
    maturedAwaitingClaim: parseFloat(maturedAwaitingClaim.toFixed(4)),
  };

  const sync = {
    lastSyncedAt: mainWallet.activitySyncedAt?.toISOString() ?? null,
    stale:
      balanceStale ||
      isActivityStaleForPortfolio(mainWallet.activitySyncedAt),
  };

  uiSnapshotLog("wallet.portfolio", {
    pollSource: pollSource ?? null,
    userId,
    mainWallet: {
      _id: serializedMainWallet._id,
      address: serializedMainWallet.address,
      name: serializedMainWallet.name,
      activationStatus: serializedMainWallet.activationStatus,
    },
    totalBalance,
    onChainUsdt: totalBalance,
    investedBalance,
    settledInvestedBalance,
    availableUsdt,
    pendingInboundUsdt: parseFloat(pendingInboundUsdt.toFixed(4)),
    breakdown,
    activePurchaseOrders,
    needsOnChainSettlement: settlementPending > 0,
    sync,
  });

  return {
    mainWallet: serializedMainWallet,
    walletSetupStatus: "ready" as const,
    activationStatus,
    activationTxId,
    tronscanActivationUrl,
    onChainUsdt: totalBalance,
    pendingInboundUsdt: parseFloat(pendingInboundUsdt.toFixed(4)),
    totalBalance,
    investedBalance,
    settledInvestedBalance,
    availableUsdt,
    breakdown,
    needsOnChainSettlement: settlementPending > 0,
    byFund,
    activePurchaseOrders,
    activePurchaseOrder: activePurchaseOrders[0] || null,
    activeWithdrawalOrders,
    sync,
  };
}

function isActivityStaleForPortfolio(
  activitySyncedAt: Date | null | undefined
): boolean {
  const env = getEnv();
  if (!activitySyncedAt) {
    return true;
  }
  return Date.now() - activitySyncedAt.getTime() > env.walletSyncStaleMs;
}
