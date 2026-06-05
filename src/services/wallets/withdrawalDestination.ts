import { getMainWallet } from "@/lib/wallets/helpers";
import * as tron from "@/services/tron/client";

export type WithdrawalDestinationValidation =
  | { valid: true; normalizedAddress: string }
  | { valid: false; message: string };

export type WithdrawalDestinationDeps = {
  normalizeTronAddress: typeof tron.normalizeTronAddress;
  validateAddress: typeof tron.validateAddress;
  isAccountActivatedOnChain: typeof tron.isAccountActivatedOnChain;
  getMainWallet: typeof getMainWallet;
};

const defaultDeps: WithdrawalDestinationDeps = {
  normalizeTronAddress: tron.normalizeTronAddress,
  validateAddress: tron.validateAddress,
  isAccountActivatedOnChain: tron.isAccountActivatedOnChain,
  getMainWallet,
};

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

  if (!(await deps.isAccountActivatedOnChain(destNorm))) {
    return {
      valid: false,
      message: "This destination address could not be found on the network",
    };
  }

  const wallet = await deps.getMainWallet(userId);
  if (wallet) {
    const walletNorm =
      (await deps.normalizeTronAddress(wallet.address)) ??
      wallet.address.trim();
    if (destNorm === walletNorm) {
      return {
        valid: false,
        message: "Destination cannot be your own wallet address",
      };
    }
  }

  return { valid: true, normalizedAddress: destNorm };
}
