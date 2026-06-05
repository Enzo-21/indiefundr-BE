import { prisma } from "@/lib/prisma";
import { DEFAULT_WALLET_NAME } from "@/lib/constants/appBranding";
import {
  serializeCustomWalletImported,
  serializeMainWalletSet,
  serializeWalletCreated,
  serializeWalletDetail,
  serializeWalletListItem,
} from "@/lib/serializers/wallet";
import { generateRandomColor } from "@/lib/utils/colorGenerator";
import { isValidObjectId } from "@/lib/validators/objectId";
import { getMainWallet } from "@/lib/wallets/helpers";
import { getEnv } from "@/lib/env";
import { slimWalletActivityTx, uiSnapshotLog } from "@/lib/uiSnapshotLog";
import * as tron from "@/services/tron/client";
import { activateWalletFromTreasury } from "@/services/tron/walletActivation";
import type { WalletActivityTx } from "./walletActivityMerge";
import { resolveWalletActivityFromChain } from "./walletActivityFromChain";
import {
  buildSuccessPaymentTxIdsForTest,
  loadPaginatedDbWalletActivity,
} from "./loadPaginatedDbWalletActivity";
import { clampActivityPageLimit } from "./walletActivityCursor";
import {
  isWalletSyncInFlight,
  runWalletSyncInBackground,
} from "./walletSyncInFlight";
import {
  isWalletBalanceCacheFresh,
  syncWallet,
} from "./walletSyncService";

export type WalletServiceResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown> | string;
      plainText?: boolean;
    };

async function fetchBalance(address: string): Promise<number> {
  try {
    if (await tron.validateAddress(address)) {
      return await tron.getUsdtBalance(address);
    }
  } catch (err) {
    console.error(
      "Balance fetch failed for",
      address,
      err instanceof Error ? err.message : err
    );
  }
  return 0;
}

export async function createWallet(userId: string): Promise<boolean> {
  try {
    const existingCount = await prisma.wallet.count({ where: { userId } });
    const newWallet = await tron.createAccount();

    const isFirstWallet = existingCount === 0;
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        address: newWallet.address,
        privateKey: newWallet.privateKey,
        color: generateRandomColor(),
        isMainWallet: isFirstWallet,
        name: DEFAULT_WALLET_NAME,
      },
    });

    // SIGNUP_ACTIVATION: re-enable when WALLET_ACTIVATION_ENABLED=true (treasury sends WALLET_ACTIVATION_TRX).
    // When disabled, addresses activate lazily on first invest via fee-sponsorship TRX top-up.
    if (isFirstWallet && getEnv().walletActivationEnabled) {
      void activateWalletFromTreasury({
        walletId: wallet.id,
        userId,
        address: wallet.address,
      }).catch((err) => {
        console.error(
          "[walletActivation] signup activation error:",
          err instanceof Error ? err.message : err
        );
      });
    }

    return true;
  } catch (error) {
    console.error(
      "createWallet error:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

export async function getUserWallets(
  userId: string
): Promise<
  WalletServiceResult<{ wallets: ReturnType<typeof serializeWalletListItem>[]; totalBalance: number }>
> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return {
        ok: false,
        status: 404,
        body: "User not found",
        plainText: true,
      };
    }

    const dbWallets = await prisma.wallet.findMany({
      where: { userId },
      select: {
        id: true,
        address: true,
        isMainWallet: true,
        name: true,
        color: true,
        isCustom: true,
      },
    });

    const wallets = [];
    let totalBalance = 0;

    for (const wallet of dbWallets) {
      const balance = await fetchBalance(wallet.address);
      totalBalance += balance;
      wallets.push(serializeWalletListItem(wallet, balance));
    }

    return { ok: true, data: { wallets, totalBalance } };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}

export async function getAccountBalance(
  userId: string
): Promise<WalletServiceResult<number>> {
  try {
    const wallet = await getMainWallet(userId);
    if (!wallet) {
      return {
        ok: false,
        status: 404,
        body: "Wallet not found",
        plainText: true,
      };
    }

    if (!(await tron.validateAddress(wallet.address))) {
      return { ok: true, data: 0 };
    }

    const balance = await tron.getUsdtBalance(wallet.address);
    return { ok: true, data: balance };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}

export async function addNewWallet(
  userId: string
): Promise<WalletServiceResult<ReturnType<typeof serializeWalletCreated>>> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return {
        ok: false,
        status: 404,
        body: "User not found",
        plainText: true,
      };
    }

    const newWallet = await tron.createAccount();
    const walletInstance = await prisma.wallet.create({
      data: {
        userId,
        address: newWallet.address,
        privateKey: newWallet.privateKey,
        color: generateRandomColor(),
        name: DEFAULT_WALLET_NAME,
      },
    });

    return {
      ok: true,
      data: serializeWalletCreated(walletInstance, 0),
    };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}

export async function getWalletById(
  userId: string,
  walletId: string
): Promise<WalletServiceResult<ReturnType<typeof serializeWalletDetail>>> {
  if (!isValidObjectId(walletId)) {
    return {
      ok: false,
      status: 400,
      body: { msg: "Invalid wallet id" },
    };
  }

  try {
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      return {
        ok: false,
        status: 404,
        body: { msg: "Wallet not found" },
      };
    }

    const balance = await fetchBalance(wallet.address);
    return { ok: true, data: serializeWalletDetail(wallet, balance) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}

export async function setMainWallet(
  userId: string,
  walletId: string
): Promise<WalletServiceResult<ReturnType<typeof serializeMainWalletSet>>> {
  if (!isValidObjectId(walletId)) {
    return {
      ok: false,
      status: 400,
      body: { msg: "Invalid wallet id" },
    };
  }

  try {
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      return {
        ok: false,
        status: 404,
        body: { msg: "Wallet not found" },
      };
    }

    await prisma.wallet.updateMany({
      where: { userId },
      data: { isMainWallet: false },
    });

    const updated = await prisma.wallet.update({
      where: { id: walletId },
      data: { isMainWallet: true },
    });

    return { ok: true, data: serializeMainWalletSet(updated) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}

export async function addCustomWallet(
  userId: string,
  input: { address: string; privateKey: string; name?: string }
): Promise<WalletServiceResult<ReturnType<typeof serializeCustomWalletImported>>> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return {
        ok: false,
        status: 404,
        body: "User not found",
        plainText: true,
      };
    }

    const { address, privateKey, name } = input;

    if (!(await tron.validateAddress(address))) {
      return {
        ok: false,
        status: 400,
        body: { msg: "Invalid Tron wallet address" },
      };
    }

    const derivedAddress = await tron.privateKeyToAddress(privateKey);

    if (address !== derivedAddress) {
      return {
        ok: false,
        status: 400,
        body: {
          msg: "Wallet Address does not match the provided private key",
        },
      };
    }

    const duplicate = await prisma.wallet.findFirst({
      where: { userId, address },
    });
    if (duplicate) {
      return {
        ok: false,
        status: 400,
        body: { msg: "This wallet is already in your account" },
      };
    }

    const walletCount = await prisma.wallet.count({ where: { userId } });
    const newWallet = await prisma.wallet.create({
      data: {
        userId,
        address,
        privateKey,
        name: name || "Imported wallet",
        isCustom: true,
        isMainWallet: walletCount === 0,
        color: generateRandomColor(),
      },
    });

    return { ok: true, data: serializeCustomWalletImported(newWallet) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}

import type {
  WalletActivitySyncMeta,
  WalletTransactionsPayload,
  WalletActivitySyncStatusPayload,
} from "./walletActivityTypes";

export type {
  WalletActivitySyncMeta,
  WalletTransactionsPayload,
  WalletActivitySyncStatusPayload,
} from "./walletActivityTypes";

function isActivityStale(
  activitySyncedAt: Date | null | undefined
): boolean {
  const env = getEnv();
  if (!activitySyncedAt) {
    return true;
  }
  return Date.now() - activitySyncedAt.getTime() > env.walletSyncStaleMs;
}

export type GetWalletTransactionsOptions = {
  pollSource?: string;
  readMode?: "db" | "chain";
  limit?: number;
  cursor?: string;
};

function buildWalletActivitySyncMeta(
  wallet: {
    activitySyncedAt: Date | null;
    chainSyncedThroughAt: Date | null;
  }
): WalletActivitySyncMeta {
  return {
    lastSyncedAt: wallet.activitySyncedAt?.toISOString() ?? null,
    chainSyncedThroughAt:
      wallet.chainSyncedThroughAt?.toISOString() ?? null,
    stale: isActivityStale(wallet.activitySyncedAt),
  };
}

const SYNC_SCHEDULE_SKIP_POLL_SOURCES = new Set([
  "sync-status",
  "activity-page",
  "sync-complete",
]);

function scheduleWalletActivitySyncIfNeeded(
  userId: string,
  wallet: { id: string; activitySyncedAt: Date | null },
  pollSource?: string
): void {
  if (pollSource && SYNC_SCHEDULE_SKIP_POLL_SOURCES.has(pollSource)) {
    return;
  }
  const stale = isActivityStale(wallet.activitySyncedAt);
  const neverSynced = !wallet.activitySyncedAt;
  if (!neverSynced && !stale) {
    return;
  }
  const syncReason = neverSynced
    ? (pollSource ?? "first_read")
    : (pollSource ?? "stale_read");
  void runWalletSyncInBackground(userId, wallet.id, syncReason, () =>
    syncWallet(userId, wallet.id, { reason: syncReason })
  );
}

export async function getWalletActivitySyncStatus(
  userId: string,
  walletId: string,
  { pollSource }: { pollSource?: string } = {}
): Promise<WalletServiceResult<WalletActivitySyncStatusPayload>> {
  if (!isValidObjectId(walletId)) {
    return {
      ok: false,
      status: 400,
      body: { msg: "Invalid wallet id" },
    };
  }

  try {
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId },
      select: {
        id: true,
        activitySyncedAt: true,
        chainSyncedThroughAt: true,
      },
    });

    if (!wallet) {
      return {
        ok: false,
        status: 404,
        body: { msg: "Wallet not found" },
      };
    }

    return {
      ok: true,
      data: {
        syncing: isWalletSyncInFlight(wallet.id),
        sync: buildWalletActivitySyncMeta(wallet),
      },
    };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}

export async function getWalletTransactions(
  userId: string,
  walletId: string,
  {
    pollSource,
    readMode,
    limit: limitOption,
    cursor,
  }: GetWalletTransactionsOptions = {}
): Promise<WalletServiceResult<WalletTransactionsPayload>> {
  if (!isValidObjectId(walletId)) {
    return {
      ok: false,
      status: 400,
      body: { msg: "Invalid wallet id" },
    };
  }

  try {
    let wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      return {
        ok: false,
        status: 404,
        body: { msg: "Wallet not found" },
      };
    }

    const env = getEnv();
    const pageLimit = clampActivityPageLimit(limitOption);
    const useDbRead =
      readMode === "db" ||
      readMode !== "chain" &&
        (env.walletActivityReadMode === "db" ||
          limitOption !== undefined ||
          cursor !== undefined);

    if (!useDbRead && env.walletActivityReadMode === "chain") {
      const payload = await resolveWalletActivityFromChain(userId, wallet, {
        pollSource,
      });
      return { ok: true, data: payload };
    }

    const stale = isActivityStale(wallet.activitySyncedAt);
    const neverSynced = !wallet.activitySyncedAt;
    const syncScheduled = neverSynced || stale;

    scheduleWalletActivitySyncIfNeeded(userId, wallet, pollSource);

    const syncing = isWalletSyncInFlight(wallet.id);

    const walletOrders = await prisma.purchaseOrder.findMany({
      where: { userId, walletId: wallet.id },
      select: {
        id: true,
        usdtTxId: true,
        failedUsdtTxIds: true,
        paymentChainOutcome: true,
        status: true,
      },
    });
    const successPaymentTxIds = buildSuccessPaymentTxIdsForTest(walletOrders);

    const { transactions, nextCursor, hasMore } =
      await loadPaginatedDbWalletActivity(
        userId,
        wallet.id,
        pageLimit,
        cursor,
        { successPaymentTxIds }
      );

    const syncMeta = buildWalletActivitySyncMeta(wallet);

    console.log("[wallet:activity] read", {
      walletId: wallet.id,
      userId,
      pollSource: pollSource ?? null,
      stale,
      neverSynced,
      syncScheduled,
      syncing,
      inFlight: isWalletSyncInFlight(wallet.id),
      activitySyncedAt: wallet.activitySyncedAt?.toISOString() ?? null,
      chainSyncedThroughAt:
        wallet.chainSyncedThroughAt?.toISOString() ?? null,
      txCount: transactions.length,
    });

    const payload = {
      transactions,
      chainHistoryError: false,
      syncing,
      sync: syncMeta,
      nextCursor,
      hasMore,
    };

    uiSnapshotLog("wallet.transactions", {
      readMode: "db",
      pollSource: pollSource ?? null,
      userId,
      walletId: wallet.id,
      address: wallet.address,
      sync: syncMeta,
      syncing: payload.syncing,
      chainHistoryError: payload.chainHistoryError,
      count: transactions.length,
      transactions: transactions.map(slimWalletActivityTx),
    });

    return {
      ok: true,
      data: payload,
    };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return {
      ok: false,
      status: 500,
      body: { msg: "Internal Server Error" },
    };
  }
}
