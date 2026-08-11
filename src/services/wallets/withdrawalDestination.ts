import type { Wallet } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getMainWallet } from "@/lib/wallets/helpers";
import * as tron from "@/services/tron/client";
import {
  activateWalletFromTreasury,
  type WalletActivationResult,
} from "@/services/tron/walletActivation";

export type WithdrawalDestinationValidation =
  | { valid: true; normalizedAddress: string }
  | { valid: false; message: string };

export type AppDestinationWallet = Pick<
  Wallet,
  "id" | "userId" | "address" | "activatedAt" | "activationTxId"
>;

export type WithdrawalDestinationDeps = {
  normalizeTronAddress: typeof tron.normalizeTronAddress;
  validateAddress: typeof tron.validateAddress;
  isAccountActivatedOnChain: typeof tron.isAccountActivatedOnChain;
  getMainWallet: typeof getMainWallet;
  findWalletByAddress: (
    address: string
  ) => Promise<AppDestinationWallet | null>;
  activateWalletFromTreasury: typeof activateWalletFromTreasury;
  waitForActivation: (
    address: string,
    timeoutMs: number
  ) => Promise<boolean>;
};

const EXTERNAL_UNACTIVATED_MESSAGE =
  "This address is not activated on the Tron network yet. It must receive a small TRX activation before it can accept USDT.";

const APP_ACTIVATION_FAILED_MESSAGE =
  "This IndieFundr wallet is not activated yet. Ask the recipient to open the app, or try again shortly.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForAccountActivation(
  address: string,
  timeoutMs: number,
  isActivated: typeof tron.isAccountActivatedOnChain = tron.isAccountActivatedOnChain,
  pollMs = 2_000
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isActivated(address)) {
      return true;
    }
    await sleep(pollMs);
  }
  return isActivated(address);
}

async function defaultFindWalletByAddress(
  address: string
): Promise<AppDestinationWallet | null> {
  return prisma.wallet.findFirst({
    where: { address },
    select: {
      id: true,
      userId: true,
      address: true,
      activatedAt: true,
      activationTxId: true,
    },
  });
}

const defaultDeps: WithdrawalDestinationDeps = {
  normalizeTronAddress: tron.normalizeTronAddress,
  validateAddress: tron.validateAddress,
  isAccountActivatedOnChain: tron.isAccountActivatedOnChain,
  getMainWallet,
  findWalletByAddress: defaultFindWalletByAddress,
  activateWalletFromTreasury,
  waitForActivation: (address, timeoutMs) =>
    waitForAccountActivation(address, timeoutMs),
};

function activationSucceeded(result: WalletActivationResult): boolean {
  return (
    result.status === "activated" || result.status === "already_active"
  );
}

async function ensureAppDestinationActivated(
  destNorm: string,
  appWallet: AppDestinationWallet,
  deps: WithdrawalDestinationDeps
): Promise<WithdrawalDestinationValidation> {
  if (!appWallet.userId) {
    return { valid: false, message: APP_ACTIVATION_FAILED_MESSAGE };
  }

  const result = await deps.activateWalletFromTreasury({
    walletId: appWallet.id,
    userId: appWallet.userId,
    address: appWallet.address,
  });

  if (activationSucceeded(result)) {
    if (await deps.isAccountActivatedOnChain(destNorm)) {
      return { valid: true, normalizedAddress: destNorm };
    }
  }

  if (result.status === "pending" || activationSucceeded(result)) {
    const timeoutMs = getEnv().walletActivationConfirmTimeoutMs;
    const ready = await deps.waitForActivation(destNorm, timeoutMs);
    if (ready) {
      return { valid: true, normalizedAddress: destNorm };
    }
  }

  console.warn("[withdrawalDestination] app wallet activation failed", {
    walletId: appWallet.id,
    address: destNorm,
    status: result.status,
    error: "error" in result ? result.error : undefined,
  });

  return { valid: false, message: APP_ACTIVATION_FAILED_MESSAGE };
}

export async function validateWithdrawalDestination(
  userId: string,
  rawAddress: string,
  deps: WithdrawalDestinationDeps = defaultDeps
): Promise<WithdrawalDestinationValidation> {
  const trimmed = rawAddress.trim();
  if (!trimmed) {
    return { valid: false, message: "Destination address is required" };
  }

  const destNorm =
    (await deps.normalizeTronAddress(trimmed)) ?? trimmed;
  if (!(await deps.validateAddress(destNorm))) {
    return {
      valid: false,
      message: "Enter a valid Tron (TRC20) address",
    };
  }

  const senderWallet = await deps.getMainWallet(userId);
  if (senderWallet) {
    const walletNorm =
      (await deps.normalizeTronAddress(senderWallet.address)) ??
      senderWallet.address.trim();
    if (destNorm === walletNorm) {
      return {
        valid: false,
        message: "Destination cannot be your own wallet address",
      };
    }
  }

  if (await deps.isAccountActivatedOnChain(destNorm)) {
    return { valid: true, normalizedAddress: destNorm };
  }

  const appWallet = await deps.findWalletByAddress(destNorm);
  if (appWallet?.userId) {
    return ensureAppDestinationActivated(destNorm, appWallet, deps);
  }

  return { valid: false, message: EXTERNAL_UNACTIVATED_MESSAGE };
}
