import { prisma } from "@/lib/prisma";
import { createWallet } from "./wallets";

export type EnsureUserWalletResult =
  | { status: "ready" }
  | { status: "created" }
  | { status: "failed"; error: string };

export function resolveEnsureWalletStatus(
  walletCount: number,
  created: boolean
): EnsureUserWalletResult {
  if (walletCount > 0) {
    return { status: "ready" };
  }
  if (created) {
    return { status: "created" };
  }
  return { status: "failed", error: "Wallet creation failed" };
}

export async function ensureUserHasWallet(
  userId: string
): Promise<EnsureUserWalletResult> {
  try {
    const walletCount = await prisma.wallet.count({ where: { userId } });
    if (walletCount > 0) {
      return { status: "ready" };
    }

    const created = await createWallet(userId);
    const result = resolveEnsureWalletStatus(walletCount, created);
    if (result.status === "failed") {
      console.error("[ensureDefaultWallet] createWallet returned false", {
        userId,
      });
    }
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[ensureDefaultWallet] ensureUserHasWallet error:", error, {
      userId,
    });
    return { status: "failed", error };
  }
}

/** @deprecated Use ensureUserHasWallet — kept for signup call sites */
export async function ensureDefaultWallet(userId: string): Promise<void> {
  await ensureUserHasWallet(userId);
}
