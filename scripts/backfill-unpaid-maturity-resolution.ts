import "dotenv/config";
import { PrismaClient, UnpaidMaturityResolution } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.investment.findMany({
    where: {
      recoveryEligibleAt: { not: null },
      unpaidMaturityResolution: null,
    },
    select: { id: true, recoveryEligibleAt: true },
  });

  if (rows.length === 0) {
    console.log("No investments to backfill.");
    return;
  }

  for (const row of rows) {
    await prisma.investment.update({
      where: { id: row.id },
      data: {
        unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery,
        unpaidMaturityResolvedAt: row.recoveryEligibleAt,
      },
    });
  }

  console.log(
    `Backfilled unpaidMaturityResolution=referral_recovery for ${rows.length} investment(s).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
