import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function dropIndex(collection: string, name: string) {
  try {
    await prisma.$runCommandRaw({
      dropIndexes: collection,
      index: name,
    });
    console.log(`Dropped index on ${collection}:`, name);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("index not found") ||
      message.includes("can't find index")
    ) {
      console.log(`Index not found on ${collection}:`, name);
      return;
    }
    throw err;
  }
}

async function main() {
  // Legacy one-open-investment-per-fund unique index — replaced by per-fund slot caps.
  await dropIndex("investments", "user_1_fundId_1_open_unique");

  await createIndex(
    "investments",
    { user: 1, fundId: 1, status: 1 },
    {
      name: "user_1_fundId_1_status",
    }
  );

  await createIndex(
    "investments",
    { status: 1, subscribedAt: 1, _id: 1 },
    {
      name: "status_1_subscribedAt_1_id_1",
    }
  );

  await createIndex(
    "investments",
    { status: 1, redeemedAt: -1 },
    {
      name: "status_1_redeemedAt_-1",
    }
  );

  await createIndex(
    "referralpayoutorders",
    { status: 1, date: 1 },
    {
      name: "status_1_date_1",
    }
  );

  await createIndex(
    "referralpayoutorders",
    { referralInviteId: 1, kind: 1 },
    {
      name: "referralInviteId_1_kind_1",
    }
  );

  await createIndex(
    "referralpayoutorders",
    { investmentId: 1, kind: 1 },
    {
      name: "investmentId_1_kind_1",
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
