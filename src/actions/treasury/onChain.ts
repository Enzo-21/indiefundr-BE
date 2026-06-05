"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { getEnv } from "@/lib/env";
import { serializeTreasuryOnChainReport } from "@/lib/serializers/treasuryAdmin";
import { getAdminOnChainReport } from "@/services/admin/treasury";
import { getLedgerSnapshot } from "@/services/revenueEngine/ledger";

export async function getTreasuryOnChainSnapshot() {
  return withAdminAction(async () => {
    const [report, ledger] = await Promise.all([
      getAdminOnChainReport(),
      getLedgerSnapshot(),
    ]);
    const serialized = serializeTreasuryOnChainReport(report);
    const env = getEnv();
    if (env.treasuryOnchainDebug || env.treasuryLedgerDebug) {
      const externalIn =
        serialized.chainSummary.byCategory.external_in.totalUsdt;
      const userPayment =
        serialized.chainSummary.byCategory.user_payment.totalUsdt;
      console.log("[getTreasuryOnChainSnapshot]", {
        transactions: serialized.transactions.length,
        onChainUsdt: serialized.balances.usdt,
        externalInUsdt: externalIn,
        userPaymentUsdt: userPayment,
        ledgerPool: ledger.poolAvailable,
      });
    }
    return serialized;
  });
}
