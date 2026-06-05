import "dotenv/config";
import {
  buildLedgerIntegrityReport,
  reconcileTreasuryLedgerFromExpected,
} from "../src/services/revenueEngine/ledgerReconcile";
import { prisma } from "../src/lib/prisma";

async function main() {
  const before = await buildLedgerIntegrityReport();
  console.log("=== Before ===");
  console.log(
    JSON.stringify(
      {
        mismatch: before.mismatch,
        confirmedSubscriptionCount: before.confirmedSubscriptionCount,
        stored: before.stored,
        expected: before.expected,
      },
      null,
      2
    )
  );

  const result = await reconcileTreasuryLedgerFromExpected();
  console.log("=== Full ledger reconcile ===");
  console.log(JSON.stringify(result, null, 2));

  const after = await buildLedgerIntegrityReport();
  console.log("=== After ===");
  console.log(
    JSON.stringify(
      {
        mismatch: after.mismatch,
        stored: after.stored,
        expected: after.expected,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
