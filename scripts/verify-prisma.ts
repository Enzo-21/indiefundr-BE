import "dotenv/config";
import { GLOBAL_LEDGER_ID, prisma } from "../src/lib/prisma";

async function main() {
  const users = await prisma.user.findMany({ take: 1 });
  const investments = await prisma.investment.findMany({ take: 1 });
  const ledger = await prisma.treasuryLedger.findUnique({
    where: { id: GLOBAL_LEDGER_ID },
  });

  console.log("User sample count:", users.length);
  console.log("Investment sample count:", investments.length);

  if (!ledger) {
    console.warn(
      "Treasury ledger missing. Run: npm run db:seed (creates global row with zeros if absent)."
    );
  } else {
    console.log("Treasury ledger global id:", ledger.id);
    console.log("Treasury ledger poolAvailable:", ledger.poolAvailable);
  }

  console.log("Prisma verification OK (read-only).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
