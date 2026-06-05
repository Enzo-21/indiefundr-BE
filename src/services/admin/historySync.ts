import type { Prisma } from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import * as tron from "@/services/tron/client";
import type { Trc20TransferRow } from "@/services/tron/client";
import {
  applyAuditWithdrawalCategoryOverride,
  loadCategoryOverridesByTxId,
} from "@/services/admin/treasuryTxClassification";
import type { AdminWithdrawalCategoryOverride } from "@/services/admin/treasuryClassification";
import { mapWithConcurrency } from "./userWalletStats";

export type AdminOnChainCategory =
  | "user_wallet_deposit"
  | "user_wallet_withdrawal"
  | "user_to_user_transfer"
  | "wallet_self_transfer"
  | "investment_payment"
  | "user_payout"
  | "treasury_app_withdrawal"
  | "treasury_outflow_untracked"
  | "treasury_external_deposit"
  | "treasury_wallet_transfer";

export type AdminOnChainDirection = "in" | "out" | "transfer";

export type AdminOnChainStatus = "confirmed" | "failed" | "pending";

export type AdminOnChainClassificationSource =
  | "app_tx"
  | "address_only"
  | "external";

type WalletIndexEntry = {
  walletId: string;
  userId: string | null;
  email: string | null;
};

type AppTxMatch = {
  userEmail: string | null;
  detail: string;
};

export type AdminHistorySyncContext = {
  treasuryAddress: string;
  walletByAddress: Map<string, WalletIndexEntry>;
  orderByTxId: Map<string, AppTxMatch>;
  redemptionByTxId: Map<string, AppTxMatch>;
  appWithdrawalByTxId: Map<string, { note: string | null }>;
  categoryOverrideByTxId: Map<string, AdminWithdrawalCategoryOverride>;
};

export type ClassifiedAdminOnChainTransfer = {
  identityKey: string;
  txId: string;
  token: "USDT";
  amountUsdt: number;
  status: AdminOnChainStatus;
  direction: AdminOnChainDirection;
  category: AdminOnChainCategory;
  classificationSource: AdminOnChainClassificationSource;
  fromAddress: string;
  toAddress: string;
  fromWalletId: string | null;
  toWalletId: string | null;
  fromUserId: string | null;
  toUserId: string | null;
  fromUserEmail: string | null;
  toUserEmail: string | null;
  detail: string | null;
  tronscanUrl: string;
  chainDate: Date;
  raw: Prisma.InputJsonValue;
};

export type AdminHistorySyncResult = {
  scannedAddresses: number;
  fetchedRows: number;
  uniqueRows: number;
  recorded: number;
  skipped: number;
  failedFetches: Array<{ address: string; error: string }>;
};

type EnrichedTrc20TransferRow = Trc20TransferRow & {
  status: AdminOnChainStatus;
};

function transactionFromJson(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function adminOnChainCategoryLabel(category: string): string {
  switch (category) {
    case "user_wallet_deposit":
      return "User wallet deposit";
    case "user_wallet_withdrawal":
      return "User wallet withdrawal";
    case "user_to_user_transfer":
      return "User-to-user transfer";
    case "wallet_self_transfer":
      return "Same-user wallet transfer";
    case "investment_payment":
      return "Investment payment";
    case "user_payout":
      return "User payout";
    case "treasury_app_withdrawal":
      return "App withdrawal";
    case "treasury_outflow_untracked":
      return "Treasury outflow (untracked)";
    case "treasury_external_deposit":
      return "Treasury external deposit";
    case "treasury_wallet_transfer":
      return "Treasury wallet transfer";
    default:
      return category;
  }
}

export function buildAdminOnChainIdentityKey(
  row: Pick<Trc20TransferRow, "txId" | "from" | "to" | "amount">
): string {
  return [
    "USDT",
    row.txId,
    row.from,
    row.to,
    row.amount.toFixed(6),
  ].join(":");
}

function buildRawMeta(
  row: Trc20TransferRow,
  observedWalletIds: string[]
): Prisma.InputJsonValue {
  return {
    observedWalletIds,
    from: row.from,
    to: row.to,
  };
}

export function classifyAdminOnChainTransfer(
  row: Trc20TransferRow & { status: AdminOnChainStatus },
  ctx: AdminHistorySyncContext
): ClassifiedAdminOnChainTransfer | null {
  if (!row.txId || row.from === row.to) return null;

  const fromWallet = ctx.walletByAddress.get(row.from) ?? null;
  const toWallet = ctx.walletByAddress.get(row.to) ?? null;
  const fromTreasury = row.from === ctx.treasuryAddress;
  const toTreasury = row.to === ctx.treasuryAddress;

  let category: AdminOnChainCategory | null = null;
  let direction: AdminOnChainDirection = "transfer";
  let classificationSource: AdminOnChainClassificationSource = "address_only";
  let detail: string | null = null;

  const orderMatch = ctx.orderByTxId.get(row.txId);
  const redemptionMatch = ctx.redemptionByTxId.get(row.txId);
  const withdrawalMatch = ctx.appWithdrawalByTxId.get(row.txId);

  if (orderMatch) {
    category = "investment_payment";
    direction = "in";
    classificationSource = "app_tx";
    detail = orderMatch.detail;
  } else if (redemptionMatch) {
    category = "user_payout";
    direction = "out";
    classificationSource = "app_tx";
    detail = redemptionMatch.detail;
  } else if (fromTreasury && !toWallet) {
    direction = "out";
    if (withdrawalMatch) {
      category = "treasury_app_withdrawal";
      classificationSource = "app_tx";
      detail = withdrawalMatch.note || "Treasury withdrawal";
    } else {
      category = "treasury_outflow_untracked";
      classificationSource = "external";
      detail = "Treasury outflow (not linked to app ledger)";
    }
  } else if (toTreasury && !fromWallet) {
    category = "treasury_external_deposit";
    direction = "in";
    classificationSource = "external";
    detail = "External deposit to treasury";
  } else if (fromTreasury || toTreasury) {
    category = "treasury_wallet_transfer";
    direction = fromTreasury ? "out" : "in";
    detail = fromTreasury
      ? "Treasury transfer to user wallet"
      : "User wallet transfer to treasury";
  } else if (fromWallet && toWallet) {
    const sameUser =
      fromWallet.userId != null && fromWallet.userId === toWallet.userId;
    category = sameUser ? "wallet_self_transfer" : "user_to_user_transfer";
    direction = "transfer";
    detail = sameUser
      ? "Transfer between wallets for the same user"
      : "Transfer between app users";
  } else if (!fromWallet && toWallet) {
    category = "user_wallet_deposit";
    direction = "in";
    classificationSource = "external";
    detail = "External deposit to user wallet";
  } else if (fromWallet && !toWallet) {
    category = "user_wallet_withdrawal";
    direction = "out";
    classificationSource = "external";
    detail = "User withdrawal to external wallet";
  }

  if (!category) return null;

  const observedWalletIds = [fromWallet?.walletId, toWallet?.walletId].filter(
    (id): id is string => Boolean(id)
  );

  const classified: ClassifiedAdminOnChainTransfer = {
    identityKey: buildAdminOnChainIdentityKey(row),
    txId: row.txId,
    token: "USDT",
    amountUsdt: row.amount,
    status: row.status,
    direction,
    category,
    classificationSource,
    fromAddress: row.from,
    toAddress: row.to,
    fromWalletId: fromWallet?.walletId ?? null,
    toWalletId: toWallet?.walletId ?? null,
    fromUserId: fromWallet?.userId ?? null,
    toUserId: toWallet?.userId ?? null,
    fromUserEmail: fromWallet?.email ?? null,
    toUserEmail: toWallet?.email ?? null,
    detail,
    tronscanUrl: getTronscanTxUrl(row.txId),
    chainDate: row.date,
    raw: buildRawMeta(row, observedWalletIds),
  };

  const override = ctx.categoryOverrideByTxId.get(row.txId);
  if (!override) return classified;

  return {
    ...classified,
    ...applyAuditWithdrawalCategoryOverride(
      row.txId,
      classified,
      ctx.categoryOverrideByTxId
    ),
  };
}

export async function loadAdminHistorySyncContext(): Promise<AdminHistorySyncContext> {
  const env = getEnv();
  const rawTreasury = env.treasuryAddress.trim();
  const treasuryAddress =
    (rawTreasury ? await tron.normalizeTronAddress(rawTreasury) : null) ??
    rawTreasury;

  const [wallets, orders, investments, withdrawals, categoryOverrideByTxId] =
    await Promise.all([
    prisma.wallet.findMany({
      select: {
        id: true,
        address: true,
        userId: true,
        user: { select: { email: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { usdtTxId: { not: null } },
      select: {
        usdtTxId: true,
        fundId: true,
        user: { select: { email: true } },
      },
    }),
    prisma.investment.findMany({
      where: { redemptionTransaction: { not: null } },
      select: {
        fundId: true,
        redemptionTransaction: true,
        user: { select: { email: true } },
      },
    }),
    prisma.appRevenueWithdrawal.findMany({
      where: { txRef: { not: null } },
      select: { txRef: true, note: true },
    }),
    loadCategoryOverridesByTxId(),
  ]);

  const walletByAddress = new Map<string, WalletIndexEntry>();
  for (const wallet of wallets) {
    const normalized =
      (await tron.normalizeTronAddress(wallet.address)) ?? wallet.address;
    if (treasuryAddress && normalized === treasuryAddress) continue;
    walletByAddress.set(normalized, {
      walletId: wallet.id,
      userId: wallet.userId ?? null,
      email: wallet.user?.email ?? null,
    });
  }

  const orderByTxId = new Map<string, AppTxMatch>();
  for (const order of orders) {
    if (!order.usdtTxId) continue;
    const fund = getFundById(order.fundId);
    orderByTxId.set(order.usdtTxId, {
      userEmail: order.user?.email ?? null,
      detail: `Subscribe (${fund?.name ?? order.fundId})`,
    });
  }

  const redemptionByTxId = new Map<string, AppTxMatch>();
  for (const investment of investments) {
    const txId = tron.getTxId(
      transactionFromJson(investment.redemptionTransaction)
    );
    if (!txId) continue;
    const fund = getFundById(investment.fundId);
    redemptionByTxId.set(txId, {
      userEmail: investment.user?.email ?? null,
      detail: `Redemption (${fund?.name ?? investment.fundId})`,
    });
  }

  const appWithdrawalByTxId = new Map<string, { note: string | null }>();
  for (const withdrawal of withdrawals) {
    if (!withdrawal.txRef) continue;
    appWithdrawalByTxId.set(withdrawal.txRef, {
      note: withdrawal.note ?? null,
    });
  }

  return {
    treasuryAddress,
    walletByAddress,
    orderByTxId,
    redemptionByTxId,
    appWithdrawalByTxId,
    categoryOverrideByTxId,
  };
}

export function auditRowWriteData(
  row: ClassifiedAdminOnChainTransfer
): Prisma.AdminOnChainTransactionCreateInput {
  return {
    identityKey: row.identityKey,
    txId: row.txId,
    token: row.token,
    amountUsdt: row.amountUsdt,
    status: row.status,
    direction: row.direction,
    category: row.category,
    classificationSource: row.classificationSource,
    fromAddress: row.fromAddress,
    toAddress: row.toAddress,
    fromWalletId: row.fromWalletId,
    toWalletId: row.toWalletId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    fromUserEmail: row.fromUserEmail,
    toUserEmail: row.toUserEmail,
    detail: row.detail,
    tronscanUrl: row.tronscanUrl,
    raw: row.raw,
    chainDate: row.chainDate,
  };
}

export function auditRowUpdateData(
  data: Prisma.AdminOnChainTransactionCreateInput
): Prisma.AdminOnChainTransactionUpdateInput {
  return {
    status: data.status,
    direction: data.direction,
    category: data.category,
    classificationSource: data.classificationSource,
    fromWalletId: data.fromWalletId,
    toWalletId: data.toWalletId,
    fromUserId: data.fromUserId,
    toUserId: data.toUserId,
    fromUserEmail: data.fromUserEmail,
    toUserEmail: data.toUserEmail,
    detail: data.detail,
    tronscanUrl: data.tronscanUrl,
    raw: data.raw,
    chainDate: data.chainDate,
  };
}

export async function upsertClassifiedAdminOnChainTransfer(
  row: ClassifiedAdminOnChainTransfer
): Promise<void> {
  const data = auditRowWriteData(row);
  const existing = await prisma.adminOnChainTransaction.findUnique({
    where: { identityKey: row.identityKey },
    select: { adminCategoryOverride: true },
  });

  const update = auditRowUpdateData(data);
  if (existing?.adminCategoryOverride) {
    delete update.category;
    delete update.classificationSource;
  }

  await prisma.adminOnChainTransaction.upsert({
    where: { identityKey: row.identityKey },
    create: data,
    update,
  });
}

export async function upsertAdminOnChainTransfers(
  rows: EnrichedTrc20TransferRow[],
  ctx?: AdminHistorySyncContext
): Promise<{ recorded: number; skipped: number }> {
  const context = ctx ?? (await loadAdminHistorySyncContext());
  let recorded = 0;
  let skipped = 0;

  for (const row of rows) {
    const classified = classifyAdminOnChainTransfer(row, context);
    if (!classified) {
      skipped += 1;
      continue;
    }
    await upsertClassifiedAdminOnChainTransfer(classified);
    recorded += 1;
  }

  return { recorded, skipped };
}

export async function upsertAdminOnChainTransfersSafely(
  rows: EnrichedTrc20TransferRow[],
  upsertFn: typeof upsertAdminOnChainTransfers = upsertAdminOnChainTransfers
): Promise<{ recorded: number; skipped: number } | null> {
  try {
    return await upsertFn(rows);
  } catch (error) {
    console.error(
      "[historySync] selected wallet sync failed",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

function uniqueTransferRows(
  fetched: Array<{ rows: Trc20TransferRow[] }>
): Trc20TransferRow[] {
  const uniqueRows = new Map<string, Trc20TransferRow>();
  for (const item of fetched) {
    for (const row of item.rows) {
      const identityKey = buildAdminOnChainIdentityKey(row);
      if (!uniqueRows.has(identityKey)) {
        uniqueRows.set(identityKey, row);
      }
    }
  }
  return Array.from(uniqueRows.values());
}

export function getUserSyncAddresses(
  ctx: AdminHistorySyncContext,
  userId: string
): string[] {
  return Array.from(ctx.walletByAddress.entries())
    .filter(([, wallet]) => wallet.userId === userId)
    .map(([address]) => address);
}

async function syncAddresses(
  addresses: string[],
  ctx: AdminHistorySyncContext
): Promise<AdminHistorySyncResult> {
  const env = getEnv();
  const uniqueAddresses = Array.from(new Set(addresses.filter(Boolean)));

  const fetched = await mapWithConcurrency(
    uniqueAddresses,
    env.adminWalletStatsConcurrency,
    async (address) => {
      try {
        const rows = await tron.getTrc20UsdtTransfersPaginated(address, {
          maxRows: env.adminWalletTxMax,
        });
        return { address, rows, error: null as string | null };
      } catch (error) {
        return {
          address,
          rows: [] as Trc20TransferRow[],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  const failedFetches = fetched
    .filter((item) => item.error)
    .map((item) => ({ address: item.address, error: item.error ?? "failed" }));

  const rows = uniqueTransferRows(fetched);

  const enriched = await tron.enrichTrc20TransferStatuses(rows, {
    concurrency: env.walletActivityStatusConcurrency,
    fallbackStatusOnLookupError: "confirmed",
  });

  const { recorded, skipped } = await upsertAdminOnChainTransfers(enriched, ctx);

  return {
    scannedAddresses: uniqueAddresses.length,
    fetchedRows: fetched.reduce((sum, item) => sum + item.rows.length, 0),
    uniqueRows: rows.length,
    recorded,
    skipped,
    failedFetches,
  };
}

export async function syncAdminOnChainHistory(): Promise<AdminHistorySyncResult> {
  const ctx = await loadAdminHistorySyncContext();
  const addresses = [
    ctx.treasuryAddress,
    ...Array.from(ctx.walletByAddress.keys()),
  ];
  return syncAddresses(addresses, ctx);
}

export async function syncUserOnChainHistory(
  userId: string
): Promise<AdminHistorySyncResult> {
  const ctx = await loadAdminHistorySyncContext();
  return syncAddresses(getUserSyncAddresses(ctx, userId), ctx);
}

export async function syncUserOnChainHistorySafely(
  userId: string,
  syncFn: typeof syncUserOnChainHistory = syncUserOnChainHistory
): Promise<AdminHistorySyncResult | null> {
  try {
    return await syncFn(userId);
  } catch (error) {
    console.error(
      "[historySync] user wallet sync failed",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
