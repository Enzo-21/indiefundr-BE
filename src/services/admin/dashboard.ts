import { InvestmentStatus, PurchaseOrderStatus } from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import { getEnv } from "@/lib/env";
import { canUserClaim } from "@/lib/investments/presentation";
import * as tron from "@/services/tron/client";
import { prisma } from "@/lib/prisma";
import {
  getWalletStatsForUsers,
  loadUserWalletStatsContext,
  type UserWalletStats,
} from "@/services/admin/userWalletStats";
import {
  type AdminInvestmentRow,
  type AdminInvestmentsListResult,
} from "@/services/admin/investmentAdminTypes";
import { formatUsdtDisplay, truncateUsdt } from "@/lib/money/formatUsdt";
import { deriveAdminPayoutStatus } from "@/services/admin/adminPayoutStatus";
import { buildInvestmentLedgerTimeline } from "@/services/admin/investmentLedgerTimeline";
import { buildInvestmentLedgerSnapshotMap } from "@/services/admin/investmentLedgerSnapshots";

export type {
  AdminInvestmentRow,
  AdminInvestmentDisplayRow,
  AdminInvestmentsListResult,
} from "@/services/admin/investmentAdminTypes";
import { getLedgerSnapshot } from "@/services/revenueEngine/ledger";
import {
  computeFifoSurplusEligibleInvestmentIds,
  getSurplusPayoutEligibilityWithFifo,
} from "@/services/revenueEngine/payoutScheduler";
import { getTronRateLimitStats } from "@/services/tron/rateLimit";

export type AdminUserWalletFields = {
  currentBalance: number | null;
  totalDeposited: number;
  totalWithdrawn: number;
  hasFundedWallet: boolean;
};

const emptyWalletStats = (): AdminUserWalletFields => ({
  currentBalance: null,
  totalDeposited: 0,
  totalWithdrawn: 0,
  hasFundedWallet: false,
});

function walletFieldsFromStats(stats: UserWalletStats): AdminUserWalletFields {
  return {
    currentBalance: stats.currentBalance,
    totalDeposited: stats.totalDeposited,
    totalWithdrawn: stats.totalWithdrawn,
    hasFundedWallet: stats.hasFundedWallet,
  };
}

export async function getAdminOverviewStats() {
  const [totalUsers, investments, pendingOrders, usersWithWallets, walletCtx] =
    await Promise.all([
      prisma.user.count(),
      prisma.investment.findMany({
        select: { userId: true, status: true },
      }),
      prisma.purchaseOrder.count({
        where: {
          status: {
            in: [PurchaseOrderStatus.queued, PurchaseOrderStatus.processing],
          },
        },
      }),
      prisma.user.findMany({
        where: { wallets: { some: {} } },
        select: { id: true },
      }),
      loadUserWalletStatsContext(),
    ]);

  const treasury = await getLedgerSnapshot();

  const investedUserIds = new Set<string>();
  let activeInvestments = 0;
  let maturedInvestments = 0;
  let redeemingInvestments = 0;
  let investmentsPaid = 0;

  for (const inv of investments) {
    if (inv.status === InvestmentStatus.failed) continue;
    investedUserIds.add(inv.userId);
    if (inv.status === InvestmentStatus.active) activeInvestments++;
    if (inv.status === InvestmentStatus.matured) maturedInvestments++;
    if (inv.status === InvestmentStatus.redeeming) redeemingInvestments++;
    if (inv.status === InvestmentStatus.redeemed) investmentsPaid++;
  }

  const walletUserIds = usersWithWallets.map((u) => u.id);
  const walletStatsMap = await getWalletStatsForUsers(walletUserIds, walletCtx);

  let usersWithFundedWallet = 0;
  let totalUsdtOnUserWallets = 0;

  for (const stats of walletStatsMap.values()) {
    if (stats.hasFundedWallet) usersWithFundedWallet++;
    if (stats.currentBalance != null) {
      totalUsdtOnUserWallets += stats.currentBalance;
    }
  }

  return {
    totalUsers,
    usersWithInvestment: investedUserIds.size,
    investmentsPaid,
    usersWithFundedWallet,
    totalUsdtOnUserWallets: truncateUsdt(totalUsdtOnUserWallets, 4),
    activeInvestments,
    maturedInvestments,
    redeemingInvestments,
    pendingOrders,
    treasury,
  };
}

export async function listAdminUsers() {
  const [users, walletCtx] = await Promise.all([
    prisma.user.findMany({
      orderBy: { date: "desc" },
      include: {
        _count: { select: { wallets: true, investments: true } },
        investments: { select: { status: true } },
      },
    }),
    loadUserWalletStatsContext(),
  ]);

  const usersWithWallets = users.filter((u) => u._count.wallets > 0);
  const walletStatsMap = await getWalletStatsForUsers(
    usersWithWallets.map((u) => u.id),
    walletCtx
  );

  return users.map((user) => {
    const nonFailed = user.investments.filter(
      (i) => i.status !== InvestmentStatus.failed
    );
    const redeemedCount = user.investments.filter(
      (i) => i.status === InvestmentStatus.redeemed
    ).length;

    const walletStats =
      user._count.wallets > 0
        ? walletFieldsFromStats(
            walletStatsMap.get(user.id) ?? {
              currentBalance: null,
              totalDeposited: 0,
              totalWithdrawn: 0,
              hasFundedWallet: false,
            }
          )
        : emptyWalletStats();

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      joinedAt: user.date,
      walletCount: user._count.wallets,
      investmentCount: nonFailed.length,
      hasInvested: nonFailed.length > 0,
      redeemedCount,
      hasPaid: redeemedCount > 0,
      ...walletStats,
    };
  });
}

export async function listFundedUsers({ limit = 15 }: { limit?: number } = {}) {
  const [users, walletCtx] = await Promise.all([
    prisma.user.findMany({
      orderBy: { date: "desc" },
      select: { id: true, email: true, name: true, date: true },
    }),
    loadUserWalletStatsContext(),
  ]);

  const walletUserIds = users
    .map((u) => u.id)
    .filter((id) => walletCtx.addressesByUserId.has(id));

  const walletStatsMap = await getWalletStatsForUsers(
    walletUserIds,
    walletCtx
  );

  return users
    .map((user) => {
      const stats = walletStatsMap.get(user.id);
      if (!stats?.hasFundedWallet) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        joinedAt: user.date,
        currentBalance: stats.currentBalance ?? 0,
        totalDeposited: stats.totalDeposited,
        totalWithdrawn: stats.totalWithdrawn,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => {
      if (b.totalDeposited !== a.totalDeposited) {
        return b.totalDeposited - a.totalDeposited;
      }
      return b.currentBalance - a.currentBalance;
    })
    .slice(0, limit);
}

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function surplusBlockReasonFromEligibility(
  reason: string,
  surplusShortfallUsdt: number
): string | null {
  if (reason === "liquidity_fifo_eligible") {
    return null;
  }
  switch (reason) {
    case "paid":
      return "Already paid";
    case "paying":
      return "Payout in progress";
    case "normal_payout_unlocked":
      return "Use Pay now (two-user unlock)";
    case "insufficient_surplus":
      return `Insufficient surplus (short ${formatUsdtDisplay(surplusShortfallUsdt)} USDT)`;
    case "fifo_surplus_blocked":
      return "Earlier investments reserve available surplus (FIFO)";
    case "not_payable_status":
      return "Not in a payable status";
    case "redemption_in_progress":
      return "Redemption already in progress";
    case "before_surplus_window":
      return "Surplus window not open yet";
    default:
      return "Surplus payout not available";
  }
}

function payNowBlockReason(
  inv: {
    status: InvestmentStatus;
    payoutUnlockedAt: Date | null;
    payoutFailureReason: string | null;
  }
): string | null {
  if (inv.status === InvestmentStatus.redeemed) {
    return "Already paid";
  }
  if (
    inv.status === InvestmentStatus.redeeming &&
    !inv.payoutFailureReason
  ) {
    return "Payout in progress";
  }
  if (
    inv.status !== InvestmentStatus.active &&
    inv.status !== InvestmentStatus.matured &&
    !(
      inv.status === InvestmentStatus.redeeming && inv.payoutFailureReason
    )
  ) {
    return `Status: ${inv.status}`;
  }
  if (!inv.payoutUnlockedAt) {
    return "Waiting for two-user unlock";
  }
  return null;
}

function getConfirmRedemptionBlockReason(inv: {
  status: InvestmentStatus;
  payoutFailureReason: string | null;
  redemptionTransaction: unknown;
}): string | null {
  if (inv.status !== InvestmentStatus.redeeming) {
    return "Investment is not awaiting on-chain confirmation";
  }
  if (inv.payoutFailureReason) {
    return inv.payoutFailureReason;
  }
  const txId = tron.getTxId(
    inv.redemptionTransaction as Record<string, unknown> | null
  );
  if (!txId) {
    return "No payout transaction id on record";
  }
  return null;
}

function showPayoutActionsForInvestment(inv: {
  status: InvestmentStatus;
  payoutFailureReason: string | null;
}): boolean {
  if (inv.status === InvestmentStatus.redeemed) {
    return false;
  }
  if (
    inv.status === InvestmentStatus.redeeming &&
    !inv.payoutFailureReason
  ) {
    return false;
  }
  return (
    inv.status === InvestmentStatus.active ||
    inv.status === InvestmentStatus.matured ||
    (inv.status === InvestmentStatus.redeeming &&
      Boolean(inv.payoutFailureReason))
  );
}

export async function listAdminInvestments(): Promise<AdminInvestmentsListResult> {
  const [rows, ledger] = await Promise.all([
    prisma.investment.findMany({
      orderBy: [{ subscribedAt: "asc" }, { id: "asc" }],
      include: {
        user: { select: { email: true, name: true } },
      },
    }),
    getLedgerSnapshot(),
  ]);

  const ledgerViews = await buildInvestmentLedgerSnapshotMap(
    rows.map((inv) => inv.id),
    rows
  );

  const unlockerUserIds = Array.from(
    new Set(rows.flatMap((inv) => inv.payoutUnlockingUserIds))
  );
  const unlockerUsers = await prisma.user.findMany({
    where: { id: { in: unlockerUserIds } },
    select: { id: true, email: true, name: true },
  });
  const unlockerMap = new Map(unlockerUsers.map((user) => [user.id, user]));

  const now = new Date();
  const fifoEligibleIds = computeFifoSurplusEligibleInvestmentIds(rows, ledger, now);
  const mappedRows: AdminInvestmentRow[] = rows.map((inv) => {
    const ledgerView = ledgerViews.get(inv.id);
    const fund = getFundById(inv.fundId);
    const canClaim = canUserClaim(inv);
    const surplusEligibility = getSurplusPayoutEligibilityWithFifo(
      inv,
      ledger,
      fifoEligibleIds,
      now
    );
    const payNowBlocked = payNowBlockReason(inv);
    const canPayNow = payNowBlocked == null;
    const canPayWithSurplus =
      surplusEligibility.eligibleForLiquiditySurplusPay && !canPayNow;
    const surplusBlocked = surplusBlockReasonFromEligibility(
      surplusEligibility.reason,
      surplusEligibility.surplusShortfallUsdt
    );
    const showPayoutActions = showPayoutActionsForInvestment(inv);
    const confirmRedemptionBlockReason = getConfirmRedemptionBlockReason(inv);
    const canConfirmRedemption =
      inv.status === InvestmentStatus.redeeming &&
      confirmRedemptionBlockReason == null;
    const payoutStatus = deriveAdminPayoutStatus(inv);
    const redemptionTxId = tron.getTxId(
      inv.redemptionTransaction as Record<string, unknown> | null
    );

    return {
      id: inv.id,
      subscribedAtIso: inv.subscribedAt?.toISOString() ?? null,
      returnPercent90d: inv.returnPercent90d,
      ledgerAfterSubscribe: ledgerView?.afterSubscribe ?? null,
      ledgerAfterPayout: ledgerView?.afterPayout ?? null,
      ledgerEventKind: ledgerView?.eventKind ?? "subscription",
      payoutUnlockingInvestmentIds: inv.payoutUnlockingInvestmentIds,
      userId: inv.userId,
      userEmail: inv.user.email,
      userName: inv.user.name,
      fundId: inv.fundId,
      fundName: fund?.name ?? inv.fundId,
      amountUsdt: inv.amountUsdt,
      projectedPayoutUsdt: inv.projectedPayoutUsdt,
      status: inv.status,
      payabilityStatus: inv.payabilityStatus,
      subscribedAt: inv.subscribedAt,
      maturesAt: inv.maturesAt,
      payoutEligibleAt: inv.payoutEligibleAt,
      payoutUnlockedAt: inv.payoutUnlockedAt,
      payoutReason: inv.payoutReason,
      payoutTriggeredBy: inv.payoutTriggeredBy,
      payoutFailureReason: inv.payoutFailureReason,
      payoutStatus,
      surplusPayoutAvailableAt: surplusEligibility.surplusPayoutAvailableAt,
      surplusShortfallUsdt: surplusEligibility.surplusShortfallUsdt,
      surplusPayoutReason: surplusEligibility.reason,
      canPayWithSurplus,
      payoutUnlockers: inv.payoutUnlockingUserIds.map((userId) => {
        const user = unlockerMap.get(userId);
        return {
          userId,
          name: user?.name ?? null,
          email: user?.email ?? null,
        };
      }),
      redeemedAt: inv.redeemedAt,
      termDaysLeft: daysUntil(inv.maturesAt),
      payoutEligibleInDays: null,
      canClaim,
      canPayNow,
      showPayoutActions,
      payNowBlockReason: payNowBlocked,
      surplusBlockReason: surplusBlocked,
      canConfirmRedemption,
      confirmRedemptionBlockReason,
      redemptionTxId,
    };
  });

  const displayRows = buildInvestmentLedgerTimeline(mappedRows, ledgerViews);

  const unlockedPayoutCount = mappedRows.filter(
    (row) => row.canPayNow && row.showPayoutActions
  ).length;
  const surplusPayoutCount = mappedRows.filter(
    (row) => row.canPayWithSurplus
  ).length;

  return {
    rows: mappedRows,
    displayRows,
    currentLedger: {
      poolAvailable: ledger.poolAvailable,
      treasurySurplus: ledger.treasurySurplus,
      poolLiquidity: ledger.poolLiquidity,
      protectedRevenueAvailable: ledger.protectedRevenueAvailable,
    },
    payoutAvailability: {
      unlockedPayoutCount,
      surplusPayoutCount,
    },
  };
}

export async function listAppWithdrawals(limit = 50) {
  const rows = await prisma.appRevenueWithdrawal.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((w) => ({
    id: w.id,
    amountUsdt: w.amountUsdt,
    slotsConsumed: w.slotsConsumed,
    txRef: w.txRef,
    note: w.note,
    createdBy: w.createdBy,
    createdAt: w.createdAt,
  }));
}

export async function getTronLimiterDiagnostics() {
  const env = getEnv();
  const stats = getTronRateLimitStats();
  return {
    timestamp: new Date(),
    tronLimiter: {
      stats,
      config: {
        rpsLimit: env.tronHttpRpsLimit,
        burst: env.tronHttpBurst,
        retryMax: env.tronHttpRetryMax,
        baseBackoffMs: env.tronHttpBaseBackoffMs,
        diagnosticsEnabled: env.tronLimiterDiagnosticsEnabled,
        logLevel: env.tronLimiterLogLevel,
      },
    },
  };
}
