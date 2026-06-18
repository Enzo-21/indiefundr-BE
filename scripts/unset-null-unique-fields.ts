import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { unsetNullUniqueUserFieldsInMongo } from "../src/lib/prisma/mongoUniqueOptionalFields";

const prisma = new PrismaClient();

async function main() {
  await unsetNullUniqueUserFieldsInMongo((command) =>
    prisma.$runCommandRaw(command)
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
