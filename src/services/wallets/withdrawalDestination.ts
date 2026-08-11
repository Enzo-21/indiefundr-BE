import { getMainWallet } from "@/lib/wallets/helpers";
import * as tron from "@/services/tron/client";

export type WithdrawalDestinationValidation =
  | { valid: true; normalizedAddress: string }
  | { valid: false; message: string };

export type WithdrawalDestinationDeps = {
  normalizeTronAddress: typeof tron.normalizeTronAddress;
  validateAddress: typeof tron.validateAddress;
  getMainWallet: typeof getMainWallet;
};

const defaultDeps: WithdrawalDestinationDeps = {
  normalizeTronAddress: tron.normalizeTronAddress,
  validateAddress: tron.validateAddress,
  getMainWallet,
};

/**
 * Destination only needs a valid TRC20 address (and not the sender's own).
 * On-chain activation is required to send, not to receive USDT.
 */
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

  return { valid: true, normalizedAddress: destNorm };
}
