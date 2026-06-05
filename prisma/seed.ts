import "dotenv/config";
import { GLOBAL_LEDGER_ID, prisma } from "../src/lib/prisma";

/**
 * Creates the singleton treasury ledger with schema defaults (zeros) if missing.
 * Does not update an existing row — avoids overwriting real app event history.
 */
async function main() {
  const existing = await prisma.treasuryLedger.findUnique({
    where: { id: GLOBAL_LEDGER_ID },
  });

  if (existing) {
    console.log("Treasury ledger already exists:", existing.id);
    return;
  }

  const ledger = await prisma.treasuryLedger.create({
    data: { id: GLOBAL_LEDGER_ID },
  });

  console.log("Created treasury ledger:", {
    id: ledger.id,
    poolAvailable: ledger.poolAvailable,
    protectedRevenueCredited: ledger.protectedRevenueCredited,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
