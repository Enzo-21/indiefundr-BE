import type { Wallet } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  findWalletActivationTxOnChain,
  getTransactionStatus,
  getTrxBalance,
  getTxId,
  isAccountActivatedOnChain,
  transferTrx,
  waitForTransactionConfirmation,
} from "@/services/tron/client";

export type WalletActivationSyncStatus = "ready" | "pending" | "failed";

export type WalletActivationResult =
  | { status: "disabled" }
  | { status: "already_active" }
  | { status: "activated"; txId: string }
  | { status: "pending"; txId: string }
  | { status: "skipped_cap" }
  | { status: "skipped_treasury_low"; treasuryTrx: number }
  | { status: "failed"; error: string };

export function isDailyActivationCapReached(
  activationsToday: number,
  maxPerDay: number
): boolean {
  return activationsToday >= maxPerDay;
}

export function isTreasuryTooLowForActivation(
  treasuryTrx: number,
  activationTrx: number,
  minTreasuryBalance: number
): boolean {
  return treasuryTrx < minTreasuryBalance + activationTrx;
}

/** Maps activation attempt result to portfolio-facing sync status. */
export function activationResultToSyncStatus(
  result: WalletActivationResult
): WalletActivationSyncStatus {
  switch (result.status) {
    case "already_active":
    case "activated":
    case "disabled":
      return "ready";
    case "pending":
      return "pending";
    case "failed":
    case "skipped_cap":
    case "skipped_treasury_low":
      return "failed";
    default:
      return "failed";
  }
}

function getStartOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function countActivationsToday(): Promise<number> {
  const since = getStartOfUtcDay();
  return prisma.wallet.count({
    where: { activatedAt: { gte: since } },
  });
}

async function markWalletActivated(
  walletId: string,
  txId?: string | null
): Promise<void> {
  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      activatedAt: new Date(),
      ...(txId ? { activationTxId: txId } : {}),
    },
  });
}

function activationTxIdMissing(
  activationTxId: string | null | undefined
): boolean {
  return !activationTxId?.trim();
}

/**
 * When activatedAt is set but activationTxId was cleared from Mongo, recover the
 * treasury activation TRX transfer from TronGrid and persist it.
 */
export async function backfillActivationTxFromNetwork(
  wallet: Pick<
    Wallet,
    "id" | "address" | "activatedAt" | "activationTxId"
  >
): Promise<string | null> {
  if (!activationTxIdMissing(wallet.activationTxId)) {
    const status = await getTransactionStatus(wallet.activationTxId!);
    if (status === "success" || status === "pending") {
      return wallet.activationTxId;
    }
  }

  const shouldBackfill =
    wallet.activatedAt != null ||
    (await isAccountActivatedOnChain(wallet.address));
  if (!shouldBackfill) {
    return null;
  }

  const env = getEnv();
  const treasuryAddress = env.treasuryAddress?.trim();
  if (!treasuryAddress) {
    return null;
  }

  const txId = await findWalletActivationTxOnChain({
    walletAddress: wallet.address,
    treasuryAddress,
    expectedAmountTrx: env.walletActivationTrx,
    activatedAt: wallet.activatedAt,
  });

  if (!txId) {
    return null;
  }

  if ((await getTransactionStatus(txId)) !== "success") {
    return null;
  }

  await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      activationTxId: txId,
      activatedAt: wallet.activatedAt ?? new Date(),
    },
  });

  console.log("[walletActivation] backfilled activation tx from network", {
    walletId: wallet.id,
    txId,
  });

  return txId;
}

/**
 * When signup activation is off, detect on-chain account creation (e.g. invest fee top-up)
 * and set activatedAt / activationTxId in DB without a signup TRX transfer.
 */
export async function recordWalletActivatedIfOnChain(
  wallet: Pick<
    Wallet,
    "id" | "address" | "activatedAt" | "activationTxId"
  >
): Promise<string | null> {
  if (wallet.activatedAt) {
    if (!activationTxIdMissing(wallet.activationTxId)) {
      return wallet.activationTxId;
    }
    return ensureActivationTxRecorded(wallet);
  }

  if (!(await isAccountActivatedOnChain(wallet.address))) {
    return null;
  }

  const txId =
    (await backfillActivationTxFromNetwork(wallet)) ??
    wallet.activationTxId ??
    null;
  await markWalletActivated(wallet.id, txId);
  return txId;
}

/** Ensures activationTxId is present when the wallet is already marked activated. */
export async function ensureActivationTxRecorded(
  wallet: Pick<
    Wallet,
    "id" | "address" | "activatedAt" | "activationTxId"
  >
): Promise<string | null> {
  if (!activationTxIdMissing(wallet.activationTxId)) {
    return wallet.activationTxId;
  }
  return backfillActivationTxFromNetwork(wallet);
}

async function persistActivationTxId(
  walletId: string,
  txId: string
): Promise<void> {
  await prisma.wallet.update({
    where: { id: walletId },
    data: { activationTxId: txId },
  });
}

async function clearActivationTxId(walletId: string): Promise<void> {
  await prisma.wallet.update({
    where: { id: walletId },
    data: { activationTxId: null },
  });
}

async function reconcileAfterBroadcast({
  walletId,
  userId,
  address,
  txId,
  activationCost,
}: {
  walletId: string;
  userId: string;
  address: string;
  txId: string;
  activationCost: number;
}): Promise<WalletActivationResult> {
  if (await isAccountActivatedOnChain(address)) {
    await markWalletActivated(walletId, txId);
    console.log("[walletActivation] wallet active on-chain after broadcast", {
      walletId,
      userId,
      txId,
    });
    return { status: "activated", txId };
  }

  const txStatus = await getTransactionStatus(txId);
  if (txStatus === "success") {
    await markWalletActivated(walletId, txId);
    return { status: "activated", txId };
  }
  if (txStatus === "failed") {
    await clearActivationTxId(walletId);
    return {
      status: "failed",
      error: "Activation transaction failed on-chain",
    };
  }

  console.log("[walletActivation] activation pending confirmation", {
    walletId,
    txId,
    amountTrx: activationCost,
  });
  return { status: "pending", txId };
}

export async function activateWalletFromTreasury({
  walletId,
  userId,
  address,
}: {
  walletId: string;
  userId: string;
  address: string;
}): Promise<WalletActivationResult> {
  const env = getEnv();

  if (!env.walletActivationEnabled) {
    return { status: "disabled" };
  }

  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId },
  });
  if (!wallet) {
    return { status: "failed", error: "Wallet not found" };
  }

  if (wallet.activatedAt) {
    await ensureActivationTxRecorded(wallet);
    return { status: "already_active" };
  }

  if (await isAccountActivatedOnChain(address)) {
    const txId =
      (await backfillActivationTxFromNetwork(wallet)) ?? wallet.activationTxId;
    await markWalletActivated(walletId, txId);
    return { status: "already_active" };
  }

  if (wallet.activationTxId) {
    const existingStatus = await getTransactionStatus(wallet.activationTxId);
    if (existingStatus === "success") {
      await markWalletActivated(walletId, wallet.activationTxId);
      return { status: "activated", txId: wallet.activationTxId };
    }
    if (existingStatus === "pending") {
      return { status: "pending", txId: wallet.activationTxId };
    }
    if (existingStatus === "failed") {
      await clearActivationTxId(walletId);
    }
  }

  const treasuryAddress = env.treasuryAddress?.trim();
  const treasuryPrivateKey = env.treasuryPrivateKey?.trim();
  if (!treasuryAddress || !treasuryPrivateKey) {
    return {
      status: "failed",
      error: "Treasury not configured for wallet activation",
    };
  }

  const activationsToday = await countActivationsToday();
  if (
    isDailyActivationCapReached(
      activationsToday,
      env.maxWalletActivationsPerDay
    )
  ) {
    console.warn("[walletActivation] daily cap reached", {
      walletId,
      activationsToday,
      cap: env.maxWalletActivationsPerDay,
    });
    return { status: "skipped_cap" };
  }

  const treasuryTrx = await getTrxBalance(treasuryAddress);
  const activationCost = env.walletActivationTrx;
  if (
    isTreasuryTooLowForActivation(
      treasuryTrx,
      activationCost,
      env.treasuryMinTrxBalance
    )
  ) {
    const minRequired = env.treasuryMinTrxBalance + activationCost;
    console.warn("[walletActivation] treasury TRX too low", {
      walletId,
      treasuryTrx,
      minRequired,
    });
    return { status: "skipped_treasury_low", treasuryTrx };
  }

  try {
    const transfer = await transferTrx({
      fromPrivateKey: treasuryPrivateKey,
      toAddress: address,
      amountTrx: activationCost,
    });
    const txId = getTxId(transfer);
    if (!txId) {
      return { status: "failed", error: "Activation broadcast missing tx id" };
    }

    await persistActivationTxId(walletId, txId);

    const confirmTimeoutMs = env.walletActivationConfirmTimeoutMs;
    let confirmed = false;
    try {
      confirmed = await waitForTransactionConfirmation(txId, {
        timeoutMs: confirmTimeoutMs,
        pollMs: 2_000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("failed on-chain")) {
        await clearActivationTxId(walletId);
        return { status: "failed", error: message };
      }
      throw err;
    }

    if (!confirmed) {
      console.warn("[walletActivation] activation tx not confirmed in time", {
        walletId,
        txId,
        confirmTimeoutMs,
      });
      return reconcileAfterBroadcast({
        walletId,
        userId,
        address,
        txId,
        activationCost,
      });
    }

    await markWalletActivated(walletId, txId);

    console.log("[walletActivation] wallet activated", {
      walletId,
      userId,
      address,
      txId,
      amountTrx: activationCost,
    });

    return { status: "activated", txId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[walletActivation] activation failed", {
      walletId,
      userId,
      error,
    });
    return { status: "failed", error };
  }
}

/** Poll on-chain / tx status; retry transfer only when safe. */
export async function syncWalletActivationStatus(
  wallet: Pick<
    Wallet,
    "id" | "userId" | "address" | "activatedAt" | "activationTxId"
  >
): Promise<{
  status: WalletActivationSyncStatus;
  txId: string | null;
}> {
  if (!getEnv().walletActivationEnabled) {
    const txId = await recordWalletActivatedIfOnChain(wallet);
    return { status: "ready", txId };
  }

  if (wallet.activatedAt) {
    const txId = await ensureActivationTxRecorded(wallet);
    return { status: "ready", txId: txId ?? wallet.activationTxId };
  }

  if (await isAccountActivatedOnChain(wallet.address)) {
    const txId =
      (await backfillActivationTxFromNetwork(wallet)) ?? wallet.activationTxId;
    await markWalletActivated(wallet.id, txId);
    return { status: "ready", txId: txId ?? wallet.activationTxId };
  }

  if (wallet.activationTxId) {
    const txStatus = await getTransactionStatus(wallet.activationTxId);
    if (txStatus === "success") {
      await markWalletActivated(wallet.id, wallet.activationTxId);
      return { status: "ready", txId: wallet.activationTxId };
    }
    if (txStatus === "pending") {
      return { status: "pending", txId: wallet.activationTxId };
    }
    if (txStatus === "failed") {
      await clearActivationTxId(wallet.id);
    }
  }

  if (!wallet.userId) {
    return { status: "failed", txId: null };
  }

  const result = await activateWalletFromTreasury({
    walletId: wallet.id,
    userId: wallet.userId,
    address: wallet.address,
  });

  const txId =
    result.status === "activated" || result.status === "pending"
      ? result.txId
      : wallet.activationTxId;

  return {
    status: activationResultToSyncStatus(result),
    txId: txId ?? null,
  };
}

/** Ensures wallet is on-chain before USDT transfer or external deposits. */
export async function ensureWalletActivated(
  wallet: Pick<Wallet, "id" | "userId" | "address" | "activatedAt" | "activationTxId">
): Promise<WalletActivationResult> {
  if (!wallet.userId) {
    return { status: "failed", error: "Wallet has no user" };
  }

  await ensureActivationTxRecorded(wallet);

  const sync = await syncWalletActivationStatus(wallet);
  if (sync.status === "ready") {
    return { status: "already_active" };
  }
  if (sync.status === "pending" && sync.txId) {
    return { status: "pending", txId: sync.txId };
  }
  return { status: "failed", error: "Wallet activation failed or unavailable" };
}
