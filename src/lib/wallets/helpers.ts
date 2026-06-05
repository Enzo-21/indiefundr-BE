import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

export async function getMainWallet(userId: string) {
  let wallet = await prisma.wallet.findFirst({
    where: { userId, isMainWallet: true },
  });
  if (!wallet) {
    wallet = await prisma.wallet.findFirst({
      where: { userId },
      orderBy: { date: "asc" },
    });
  }
  return wallet;
}

export function chainTransferLabel(
  type: "in" | "out",
  status: string
): string {
  if (type === "in") {
    return status === "pending" ? "Receiving USDT" : "USDT received";
  }
  return "USDT sent";
}

export function getTronscanTxUrl(txId: string): string {
  const network = getEnv().blockchainNetwork;
  const base =
    network === "mainnet"
      ? "https://tronscan.org"
      : "https://shasta.tronscan.org";
  return `${base}/#/transaction/${txId}`;
}

export function buildWalletActivityWhere(
  userId: string,
  walletId: string,
  mainWalletId?: string | null
): Prisma.InvestmentWhereInput {
  const or: Prisma.InvestmentWhereInput[] = [{ walletId }];
  if (mainWalletId && walletId === mainWalletId) {
    // Legacy included investments with missing wallet on main wallet activity.
    // Prisma requires walletId; no extra branch needed for new data.
  }
  return { userId, OR: or };
}

export function buildFailedInvestmentActivityWhere(
  userId: string,
  walletId: string,
  mainWalletId?: string | null
): Prisma.FailedInvestmentWhereInput {
  const or: Prisma.FailedInvestmentWhereInput[] = [{ walletId }];
  if (mainWalletId && walletId === mainWalletId) {
    or.push({ walletId: null });
  }
  return { userId, OR: or };
}

export function buildPurchaseOrderActivityWhere(
  userId: string,
  walletId: string,
  mainWalletId?: string | null
): Prisma.PurchaseOrderWhereInput {
  const or: Prisma.PurchaseOrderWhereInput[] = [{ walletId }];
  if (mainWalletId && walletId === mainWalletId) {
    // Purchase orders always have wallet in schema; match walletId only.
  }
  return { userId, OR: or };
}
