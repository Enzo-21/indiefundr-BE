import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * MongoDB unique indexes treat multiple explicit nulls as duplicates.
 * Optional @unique Prisma fields should be unset, not stored as null.
 */
async function unsetNullField(collection: string, field: string) {
  const result = await prisma.$runCommandRaw({
    update: collection,
    updates: [
      {
        q: { [field]: null },
        u: { $unset: { [field]: "" } },
        multi: true,
      },
    ],
  });

  const payload = result as { n?: number; nModified?: number };
  const modified = payload.nModified ?? payload.n ?? 0;
  console.log(`Unset ${field} on ${modified} document(s) in ${collection}`);
}

async function main() {
  await unsetNullField("users", "referredByInviteId");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
