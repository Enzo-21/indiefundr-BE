import type { Wallet } from "@prisma/client";

export type WalletListItemJson = {
  _id: string;
  address: string;
  name: string;
  color: string;
  isMainWallet: boolean;
  isCustom?: boolean;
  balance?: number;
  date?: string;
};

export type WalletDetailJson = WalletListItemJson & {
  privateKey: string;
  date: string;
};

export function serializeWalletListItem(
  wallet: Pick<
    Wallet,
    "id" | "address" | "name" | "color" | "isMainWallet" | "isCustom"
  >,
  balance?: number
): WalletListItemJson {
  return {
    _id: wallet.id,
    address: wallet.address,
    name: wallet.name,
    color: wallet.color,
    isMainWallet: wallet.isMainWallet,
    isCustom: wallet.isCustom,
    ...(balance !== undefined ? { balance } : {}),
  };
}

export function serializeWalletDetail(
  wallet: Wallet,
  balance: number
): WalletDetailJson {
  return {
    _id: wallet.id,
    address: wallet.address,
    name: wallet.name,
    color: wallet.color,
    isMainWallet: wallet.isMainWallet,
    isCustom: wallet.isCustom,
    balance,
    privateKey: wallet.privateKey,
    date: wallet.date.toISOString(),
  };
}

export function serializeWalletCreated(
  wallet: Wallet,
  balance = 0
): WalletListItemJson & { balance: number } {
  return {
    ...serializeWalletListItem(wallet, balance),
    balance,
  };
}

export function serializeCustomWalletImported(wallet: Wallet): {
  _id: string;
  address: string;
  privateKey: string;
  name: string;
  color: string;
  isCustom: boolean;
  isMainWallet: boolean;
} {
  return {
    _id: wallet.id,
    address: wallet.address,
    privateKey: wallet.privateKey,
    name: wallet.name,
    color: wallet.color,
    isCustom: wallet.isCustom,
    isMainWallet: wallet.isMainWallet,
  };
}

export function serializeMainWalletSet(
  wallet: Pick<Wallet, "id" | "address" | "name">
): {
  _id: string;
  address: string;
  name: string;
  isMainWallet: true;
} {
  return {
    _id: wallet.id,
    address: wallet.address,
    name: wallet.name,
    isMainWallet: true,
  };
}

export function serializePortfolioMainWallet(
  wallet: Pick<
    Wallet,
    "id" | "address" | "name" | "color" | "activatedAt" | "activationTxId"
  >,
  activation?: {
    activationStatus: "ready" | "pending" | "failed";
    tronscanActivationUrl?: string | null;
  }
): {
  _id: string;
  address: string;
  name: string;
  color: string;
  activatedAt: string | null;
  activationTxId: string | null;
  activationStatus: "ready" | "pending" | "failed";
  tronscanActivationUrl: string | null;
} {
  const activationStatus =
    activation?.activationStatus ??
    (wallet.activatedAt ? "ready" : "pending");
  return {
    _id: wallet.id,
    address: wallet.address,
    name: wallet.name,
    color: wallet.color,
    activatedAt: wallet.activatedAt?.toISOString() ?? null,
    activationTxId: wallet.activationTxId ?? null,
    activationStatus,
    tronscanActivationUrl: activation?.tronscanActivationUrl ?? null,
  };
}
