import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { backfillRecoveryTriadExclusions } from "../src/services/referrals/recoveryTriadExclusions";

const prisma = new PrismaClient();

async function main() {
  const result = await backfillRecoveryTriadExclusions(prisma);
  console.log(
    `Recovery triad exclusion backfill complete. updated=${result.updated} skipped=${result.skipped}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
