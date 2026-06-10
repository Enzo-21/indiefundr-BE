import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { allocateUniqueUsername } from "../src/lib/users/username";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { username: null },
    select: { id: true, email: true },
  });

  if (users.length === 0) {
    console.log("No users to backfill.");
    return;
  }

  for (const user of users) {
    const username = await allocateUniqueUsername(user.email);
    await prisma.user.update({
      where: { id: user.id },
      data: { username },
    });
  }

  console.log(`Backfilled username for ${users.length} user(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
