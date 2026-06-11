import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { backfillPlayerPowerUses } from "../src/services/playerPowers/playerPowers";

const prisma = new PrismaClient();

async function main() {
  const result = await backfillPlayerPowerUses(prisma);
  console.log(
    `Player power backfill complete. created=${result.created} skipped=${result.skipped}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
