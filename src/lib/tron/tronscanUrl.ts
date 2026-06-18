import { getEnv } from "@/lib/env";

/** Client-safe TronScan transaction URL (no Prisma or DB imports). */
export function getTronscanTxUrl(txId: string): string {
  const network = getEnv().blockchainNetwork;
  const base =
    network === "mainnet"
      ? "https://tronscan.org"
      : "https://shasta.tronscan.org";
  return `${base}/#/transaction/${txId}`;
}
