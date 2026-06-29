import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { healStuckUnpaidMaturityChoiceDeadlines } from "../src/services/investments/unpaidMaturityChoice";

const prisma = new PrismaClient();

async function main() {
  const healed = await healStuckUnpaidMaturityChoiceDeadlines();
  console.log(
    `Backfill complete: set unpaidMaturityChoiceDeadlineAt on ${healed} investment(s).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
