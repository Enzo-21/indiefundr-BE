import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OPEN_INVESTMENT_STATUSES = [
  "pending",
  "active",
  "matured",
  "redeeming",
] as const;

const ACTIVE_PURCHASE_ORDER_STATUSES = ["queued", "processing"] as const;

async function createIndex(
  collection: string,
  keys: Record<string, 1 | -1>,
  options: Record<string, unknown>
) {
  try {
    await prisma.$runCommandRaw({
      createIndexes: collection,
      indexes: [{ key: keys, ...options }],
    });
    console.log(`Created index on ${collection}:`, keys, options.name ?? "");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("already exists") ||
      message.includes("IndexOptionsConflict") ||
      message.includes("IndexKeySpecsConflict")
    ) {
      console.log(`Index already exists on ${collection}:`, keys);
      return;
    }
    throw err;
  }
}

async function main() {
  await createIndex(
    "investments",
    { user: 1, fundId: 1 },
    {
      name: "user_1_fundId_1_open_unique",
      unique: true,
      partialFilterExpression: {
        status: { $in: [...OPEN_INVESTMENT_STATUSES] },
      },
    }
  );

  await createIndex(
    "purchaseorders",
    { user: 1, fundId: 1 },
    {
      name: "user_1_fundId_1_active_unique",
      unique: true,
      partialFilterExpression: {
        status: { $in: [...ACTIVE_PURCHASE_ORDER_STATUSES] },
      },
    }
  );

  await createIndex(
    "refreshsessions",
    { expiresAt: 1 },
    {
      name: "expiresAt_1_ttl",
      expireAfterSeconds: 0,
    }
  );

  console.log("MongoDB partial/TTL indexes ensured.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
