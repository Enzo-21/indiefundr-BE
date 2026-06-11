import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { allocateUniqueUsername } from "../src/lib/users/username";

const prisma = new PrismaClient();

function needsUsername(username: string | null | undefined): boolean {
  return username == null || username.trim() === "";
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, username: true },
  });

  const toBackfill = users.filter((user) => needsUsername(user.username));

  if (toBackfill.length === 0) {
    console.log("No users to backfill.");
    return;
  }

  for (const user of toBackfill) {
    const username = await allocateUniqueUsername(user.email);
    await prisma.user.update({
      where: { id: user.id },
      data: { username },
    });
  }

  console.log(`Backfilled username for ${toBackfill.length} user(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
