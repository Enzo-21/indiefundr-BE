import { getEnv } from "@/lib/env";
import { truncateUsdt } from "@/lib/money/formatUsdt";
import { prisma } from "@/lib/prisma";
import { subtractPendingInboundUsdt } from "@/services/tron/client";
import * as tron from "@/services/tron/client";
import {
  aggregateTransferTotals,
  classifyUserTransfer,
  type UserWalletStatsContext,
} from "@/services/admin/userWalletStats";

export type AdminWalletSyncMeta = {
  lastSyncedAt: string | null;
  staleWalletCount: number;
  isStale: boolean;
};

export type AdminWalletAggregates = {
  usersWithFundedWallet: number;
  totalUsdtOnUserWallets: number;
  syncMeta: AdminWalletSyncMeta;
};

export type AdminFundedUserRow = {
  id: string;
  email: string;
  name: string;
  joinedAt: Date;
  currentBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
};

export type AdminWalletStatsPayload = {
  aggregates: AdminWalletAggregates;
  fundedUsers: AdminFundedUserRow[];
};

type WalletRecord = {
  id: string;
  userId: string;
  address: string;
  isMainWallet: boolean;
  date: Date;
  onChainUsdtCached: number | null;
  onChainUsdtCachedAt: Date | null;
  pendingInboundCached: number | null;
};

type ChainTransferRecord = {
  walletId: string;
  txId: string;
  type: string;
  amountUsdt: number;
  status: string;
  raw: unknown;
};

function transactionFromJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export async function loadUserWalletStatsContextFromDb(): Promise<UserWalletStatsContext> {
  const env = getEnv();
  const treasuryAddress = env.treasuryAddress?.trim() || "";

  const [wallets, orders, investments] = await Promise.all([
    prisma.wallet.findMany({
      select: { address: true, userId: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { usdtTxId: { not: null } },
      select: { usdtTxId: true },
    }),
    prisma.investment.findMany({
      where: { redemptionTransaction: { not: null } },
      select: { redemptionTransaction: true },
    }),
  ]);

  const walletByAddress = new Map<string, { userId: string }>();
  const userWalletAddresses = new Set<string>();
  const addressesByUserId = new Map<string, Set<string>>();

  for (const wallet of wallets) {
    if (!wallet.userId) continue;
    const normalized = wallet.address.trim();
    if (treasuryAddress && normalized === treasuryAddress) continue;

    walletByAddress.set(normalized, { userId: wallet.userId });
    userWalletAddresses.add(normalized);

    let userSet = addressesByUserId.get(wallet.userId);
    if (!userSet) {
      userSet = new Set<string>();
      addressesByUserId.set(wallet.userId, userSet);
    }
    userSet.add(normalized);
  }

  const orderByTxId = new Set(
    orders
      .map((order) => order.usdtTxId?.trim())
      .filter((txId): txId is string => Boolean(txId))
  );

  const redemptionByTxId = new Set<string>();
  for (const investment of investments) {
    const txId = tron.getTxId(
      transactionFromJson(investment.redemptionTransaction)
    );
    if (txId) redemptionByTxId.add(txId);
  }

  return {
    treasuryAddress,
    userWalletAddresses,
    walletByAddress,
    addressesByUserId,
    orderByTxId,
    redemptionByTxId,
  };
}

export function balanceFromCachedWallet(wallet: {
  onChainUsdtCached: number | null;
  pendingInboundCached: number | null;
}): number | null {
  if (wallet.onChainUsdtCached == null) {
    return null;
  }
  return subtractPendingInboundUsdt(
    wallet.onChainUsdtCached,
    wallet.pendingInboundCached ?? 0
  );
}

export function chainTransferToClassifyInput(
  transfer: ChainTransferRecord,
  walletAddress: string
) {
  const raw = transactionFromJson(transfer.raw);
  const from =
    typeof raw?.from === "string"
      ? raw.from
      : transfer.type === "in"
        ? ""
        : walletAddress;
  const to =
    typeof raw?.to === "string"
      ? raw.to
      : transfer.type === "out"
        ? ""
        : walletAddress;

  return {
    txId: transfer.txId,
    type: transfer.type as "in" | "out",
    from,
    to,
    amount: transfer.amountUsdt,
    status: transfer.status,
  };
}

export function computeUserWalletStatsFromDb(
  userId: string,
  wallets: WalletRecord[],
  transfersByWalletId: Map<string, ChainTransferRecord[]>,
  walletAddressById: Map<string, string>,
  ctx: UserWalletStatsContext
) {
  const userAddresses = ctx.addressesByUserId.get(userId);
  if (!userAddresses?.size) {
    return {
      currentBalance: null as number | null,
      totalDeposited: 0,
      totalWithdrawn: 0,
      hasFundedWallet: false,
    };
  }

  const classified: Array<{
    txId: string;
    category: ReturnType<typeof classifyUserTransfer>;
    amount: number;
    status: string;
  }> = [];

  for (const wallet of wallets) {
    const rows = transfersByWalletId.get(wallet.id) ?? [];
    const walletAddress = walletAddressById.get(wallet.id) ?? wallet.address;
    for (const transfer of rows) {
      const input = chainTransferToClassifyInput(transfer, walletAddress);
      classified.push({
        txId: input.txId,
        category: classifyUserTransfer(input, userId, userAddresses, ctx),
        amount: input.amount,
        status: input.status,
      });
    }
  }

  const { totalDeposited, totalWithdrawn } = aggregateTransferTotals(classified);

  const mainWallet =
    wallets.find((wallet) => wallet.isMainWallet) ??
    [...wallets].sort((a, b) => a.date.getTime() - b.date.getTime())[0];

  const currentBalance = mainWallet
    ? balanceFromCachedWallet(mainWallet)
    : null;

  const hasFundedWallet =
    totalDeposited > 0 || (currentBalance != null && currentBalance > 0);

  return {
    currentBalance,
    totalDeposited,
    totalWithdrawn,
    hasFundedWallet,
  };
}

export function buildWalletSyncMeta(wallets: WalletRecord[]): AdminWalletSyncMeta {
  const env = getEnv();
  const staleBefore = Date.now() - env.walletSyncStaleMs;
  let lastSyncedAt: Date | null = null;
  let staleWalletCount = 0;

  for (const wallet of wallets) {
    if (!wallet.onChainUsdtCachedAt) {
      staleWalletCount += 1;
      continue;
    }
    if (wallet.onChainUsdtCachedAt.getTime() < staleBefore) {
      staleWalletCount += 1;
    }
    if (!lastSyncedAt || wallet.onChainUsdtCachedAt > lastSyncedAt) {
      lastSyncedAt = wallet.onChainUsdtCachedAt;
    }
  }

  return {
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    staleWalletCount,
    isStale: staleWalletCount > 0,
  };
}

export async function getAdminWalletStatsFromDb({
  fundedLimit = 15,
}: { fundedLimit?: number } = {}): Promise<AdminWalletStatsPayload> {
  const [ctx, wallets, users] = await Promise.all([
    loadUserWalletStatsContextFromDb(),
    prisma.wallet.findMany({
      where: { userId: { not: null } },
      select: {
        id: true,
        userId: true,
        address: true,
        isMainWallet: true,
        date: true,
        onChainUsdtCached: true,
        onChainUsdtCachedAt: true,
        pendingInboundCached: true,
      },
    }),
    prisma.user.findMany({
      select: { id: true, email: true, name: true, date: true },
    }),
  ]);

  const walletRecords: WalletRecord[] = wallets
    .filter((wallet): wallet is typeof wallet & { userId: string } =>
      Boolean(wallet.userId)
    )
    .map((wallet) => ({
      id: wallet.id,
      userId: wallet.userId,
      address: wallet.address.trim(),
      isMainWallet: wallet.isMainWallet,
      date: wallet.date,
      onChainUsdtCached: wallet.onChainUsdtCached,
      onChainUsdtCachedAt: wallet.onChainUsdtCachedAt,
      pendingInboundCached: wallet.pendingInboundCached,
    }));

  const walletIds = walletRecords.map((wallet) => wallet.id);
  const transfers =
    walletIds.length > 0
      ? await prisma.walletChainTransfer.findMany({
          where: { walletId: { in: walletIds } },
          select: {
            walletId: true,
            txId: true,
            type: true,
            amountUsdt: true,
            status: true,
            raw: true,
          },
        })
      : [];

  const transfersByWalletId = new Map<string, ChainTransferRecord[]>();
  for (const transfer of transfers) {
    const bucket = transfersByWalletId.get(transfer.walletId) ?? [];
    bucket.push(transfer);
    transfersByWalletId.set(transfer.walletId, bucket);
  }

  const walletAddressById = new Map(
    walletRecords.map((wallet) => [wallet.id, wallet.address])
  );

  const walletsByUserId = new Map<string, WalletRecord[]>();
  for (const wallet of walletRecords) {
    const bucket = walletsByUserId.get(wallet.userId) ?? [];
    bucket.push(wallet);
    walletsByUserId.set(wallet.userId, bucket);
  }

  const userById = new Map(users.map((user) => [user.id, user]));

  let usersWithFundedWallet = 0;
  let totalUsdtOnUserWallets = 0;
  const fundedCandidates: AdminFundedUserRow[] = [];

  for (const [userId, userWallets] of walletsByUserId) {
    const stats = computeUserWalletStatsFromDb(
      userId,
      userWallets,
      transfersByWalletId,
      walletAddressById,
      ctx
    );

    if (stats.hasFundedWallet) {
      usersWithFundedWallet += 1;
    }
    if (stats.currentBalance != null) {
      totalUsdtOnUserWallets += stats.currentBalance;
    }

    if (!stats.hasFundedWallet) continue;

    const user = userById.get(userId);
    if (!user) continue;

    fundedCandidates.push({
      id: user.id,
      email: user.email,
      name: user.name,
      joinedAt: user.date,
      currentBalance: stats.currentBalance ?? 0,
      totalDeposited: stats.totalDeposited,
      totalWithdrawn: stats.totalWithdrawn,
    });
  }

  fundedCandidates.sort((a, b) => {
    if (b.totalDeposited !== a.totalDeposited) {
      return b.totalDeposited - a.totalDeposited;
    }
    return b.currentBalance - a.currentBalance;
  });

  return {
    aggregates: {
      usersWithFundedWallet,
      totalUsdtOnUserWallets: truncateUsdt(totalUsdtOnUserWallets, 4),
      syncMeta: buildWalletSyncMeta(walletRecords),
    },
    fundedUsers: fundedCandidates.slice(0, fundedLimit),
  };
}
