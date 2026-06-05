/**
 * On-demand purchase-order heal (same logic as cron `purchase_order_stale_heal` stage).
 * Scheduled automatically every minute by /api/cron/investments in dev and production.
 *
 * Usage:
 *   npm run heal:purchase-orders        # one bounded pass (default max 50 orders)
 *   npm run heal:purchase-orders -- --all   # loop until backlog drained (ops)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  runScheduledPurchaseOrderHeal,
  runScheduledPurchaseOrderHealAll,
} from "../src/services/orders/purchaseOrderProcessor";

async function main(): Promise<void> {
  const runAll = process.argv.includes("--all");
  const result = runAll
    ? await runScheduledPurchaseOrderHealAll()
    : await runScheduledPurchaseOrderHeal();

  console.log(
    JSON.stringify(
      {
        mode: runAll ? "all" : "bounded",
        ...result,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("[heal] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
