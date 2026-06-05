import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { syncWallet } from "../src/services/wallets/walletSyncService";

async function main() {
  const wallets = await prisma.wallet.findMany({
    where: { userId: { not: null } },
    select: { id: true, userId: true, address: true },
  });

  console.log(`[resync] Syncing ${wallets.length} wallets...`);
  let ok = 0;
  for (const wallet of wallets) {
    if (!wallet.userId) continue;
    try {
      const result = await syncWallet(wallet.userId, wallet.id, {
        reason: "backfill",
      });
      console.log("[resync] ok", wallet.address, result.activityCount);
      ok += 1;
    } catch (error) {
      console.error(
        "[resync] failed",
        wallet.id,
        error instanceof Error ? error.message : error
      );
    }
  }
  console.log(`[resync] Done: ${ok}/${wallets.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
