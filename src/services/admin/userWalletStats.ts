import { getEnv } from "@/lib/env";
import { truncateUsdt } from "@/lib/money/formatUsdt";
import { getMainWallet } from "@/lib/wallets/helpers";
import { prisma } from "@/lib/prisma";
import * as tron from "@/services/tron/client";
import type { Trc20TransferRow } from "@/services/tron/client";

export type UserTransferCategory =
  | "external_deposit"
  | "p2p_in"
  | "external_withdrawal"
  | "p2p_out"
  | "redemption"
  | "invest_payment"
  | "self";

type WalletIndexEntry = {
  userId: string;
};

export type UserWalletStatsContext = {
  treasuryAddress: string;
  userWalletAddresses: Set<string>;
  walletByAddress: Map<string, WalletIndexEntry>;
  addressesByUserId: Map<string, Set<string>>;
  orderByTxId: Set<string>;
  redemptionByTxId: Set<string>;
};

export type UserWalletStats = {
  currentBalance: number | null;
  totalDeposited: number;
  totalWithdrawn: number;
  hasFundedWallet: boolean;
};

function transactionFromJson(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function classifyUserTransfer(
  row: Pick<Trc20TransferRow, "txId" | "type" | "from" | "to">,
  userId: string,
  userAddresses: Set<string>,
  ctx: UserWalletStatsContext
): UserTransferCategory | null {
  if (row.from === row.to) return null;

  const involvesUser =
    userAddresses.has(row.from) || userAddresses.has(row.to);
  if (!involvesUser) return null;

  const counterparty = row.type === "in" ? row.from : row.to;

  if (row.type === "in") {
    if (userAddresses.has(counterparty)) return "self";
    if (counterparty === ctx.treasuryAddress) {
      return ctx.redemptionByTxId.has(row.txId) ? "redemption" : null;
    }
    if (ctx.userWalletAddresses.has(counterparty)) {
      const other = ctx.walletByAddress.get(counterparty);
      return other?.userId !== userId ? "p2p_in" : "self";
    }
    return "external_deposit";
  }

  if (userAddresses.has(counterparty)) return "self";
  if (counterparty === ctx.treasuryAddress) {
    return ctx.orderByTxId.has(row.txId) ? "invest_payment" : null;
  }
  if (ctx.userWalletAddresses.has(counterparty)) {
    const other = ctx.walletByAddress.get(counterparty);
    return other?.userId !== userId ? "p2p_out" : "self";
  }
  return "external_withdrawal";
}

export function applyTransferToTotals(
  category: UserTransferCategory | null,
  amount: number,
  status: string,
  totals: { totalDeposited: number; totalWithdrawn: number }
): void {
  if (!category || status !== "confirmed") return;
  if (category === "external_deposit" || category === "p2p_in") {
    totals.totalDeposited += amount;
  } else if (category === "external_withdrawal" || category === "p2p_out") {
    totals.totalWithdrawn += amount;
  }
}

export function aggregateTransferTotals(
  transfers: Array<{
    txId: string;
    category: UserTransferCategory | null;
    amount: number;
    status: string;
  }>
): { totalDeposited: number; totalWithdrawn: number } {
  const seen = new Set<string>();
  const totals = { totalDeposited: 0, totalWithdrawn: 0 };

  for (const transfer of transfers) {
    if (!transfer.txId || seen.has(transfer.txId)) continue;
    seen.add(transfer.txId);
    applyTransferToTotals(
      transfer.category,
      transfer.amount,
      transfer.status,
      totals
    );
  }

  return {
    totalDeposited: truncateUsdt(totals.totalDeposited, 4),
    totalWithdrawn: truncateUsdt(totals.totalWithdrawn, 4),
  };
}

export async function loadUserWalletStatsContext(): Promise<UserWalletStatsContext> {
  const env = getEnv();
  const rawTreasury = env.treasuryAddress?.trim() || "";
  const treasuryAddress =
    (rawTreasury ? await tron.normalizeTronAddress(rawTreasury) : null) ??
    rawTreasury;

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

  const walletByAddress = new Map<string, WalletIndexEntry>();
  const userWalletAddresses = new Set<string>();
  const addressesByUserId = new Map<string, Set<string>>();

  for (const wallet of wallets) {
    if (!wallet.userId) continue;
    const normalized =
      (await tron.normalizeTronAddress(wallet.address)) ?? wallet.address;
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
      .map((o) => o.usdtTxId?.trim())
      .filter((txId): txId is string => Boolean(txId))
  );

  const redemptionByTxId = new Set<string>();
  for (const inv of investments) {
    const txId = tron.getTxId(transactionFromJson(inv.redemptionTransaction));
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

async function fetchUserTransferHistory(
  addresses: Set<string>,
  maxRows: number
): Promise<Trc20TransferRow[]> {
  const rows: Trc20TransferRow[] = [];
  const seenTxIds = new Set<string>();

  for (const address of addresses) {
    const page = await tron.getTrc20UsdtTransfersPaginated(address, {
      maxRows,
    });
    for (const row of page) {
      if (row.txId && seenTxIds.has(row.txId)) continue;
      if (row.txId) seenTxIds.add(row.txId);
      rows.push(row);
    }
  }

  return rows;
}

export async function getUserWalletStats(
  userId: string,
  ctx: UserWalletStatsContext
): Promise<UserWalletStats> {
  const userAddresses = ctx.addressesByUserId.get(userId);
  if (!userAddresses?.size) {
    return {
      currentBalance: null,
      totalDeposited: 0,
      totalWithdrawn: 0,
      hasFundedWallet: false,
    };
  }

  const env = getEnv();
  const maxRows = env.adminWalletTxMax;

  const [rawRows, mainWallet] = await Promise.all([
    fetchUserTransferHistory(userAddresses, maxRows),
    getMainWallet(userId),
  ]);

  const enriched = await tron.enrichTrc20TransferStatuses(rawRows, {
    concurrency: env.walletActivityStatusConcurrency,
    fallbackStatusOnLookupError: "confirmed",
  });

  const classified = enriched.map((row) => ({
    txId: row.txId,
    category: classifyUserTransfer(row, userId, userAddresses, ctx),
    amount: row.amount,
    status: row.status,
  }));

  const { totalDeposited, totalWithdrawn } =
    aggregateTransferTotals(classified);

  let currentBalance: number | null = null;
  if (mainWallet && (await tron.validateAddress(mainWallet.address))) {
    const onChainUsdt = await tron.getUsdtBalance(mainWallet.address);
    const pendingInbound = await tron.getPendingIncomingUsdtTotal(
      mainWallet.address
    );
    currentBalance = tron.subtractPendingInboundUsdt(
      onChainUsdt,
      pendingInbound
    );
  }

  const hasFundedWallet =
    totalDeposited > 0 || (currentBalance != null && currentBalance > 0);

  return {
    currentBalance,
    totalDeposited,
    totalWithdrawn,
    hasFundedWallet,
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function getWalletStatsForUsers(
  userIds: string[],
  ctx: UserWalletStatsContext
): Promise<Map<string, UserWalletStats>> {
  const env = getEnv();
  const statsList = await mapWithConcurrency(
    userIds,
    env.adminWalletStatsConcurrency,
    async (userId) => ({
      userId,
      stats: await getUserWalletStats(userId, ctx),
    })
  );

  return new Map(statsList.map(({ userId, stats }) => [userId, stats]));
}
