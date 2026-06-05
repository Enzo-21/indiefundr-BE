import type { PurchaseOrder } from "@prisma/client";
import { getMainWallet } from "@/lib/wallets/helpers";
import { rebuildWalletActivity } from "./walletActivityMaterializer";

/** Rebuild materialized activity after order/investment mutations. */
export async function refreshWalletActivityForOrder(
  order: Pick<PurchaseOrder, "userId" | "walletId">
): Promise<void> {
  if (!order.userId || !order.walletId) {
    return;
  }
  const mainWallet = await getMainWallet(order.userId);
  await rebuildWalletActivity(order.userId, order.walletId, mainWallet?.id);
}
