import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { recalculateUserLevel } from "../src/services/playerLevels/playerLevelProgress";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, level: true },
    orderBy: { createdAt: "asc" },
  });

  if (users.length === 0) {
    console.log("No users to backfill.");
    return;
  }

  let updated = 0;
  for (const user of users) {
    const result = await recalculateUserLevel(user.id);
    if (result.changed) {
      updated += 1;
      console.log(
        `User ${user.id}: level ${result.previousLevel} -> ${result.newLevel}`
      );
    }
  }

  console.log(
    `Backfilled player levels for ${users.length} user(s); ${updated} level change(s).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
