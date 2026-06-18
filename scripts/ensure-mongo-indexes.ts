import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { unsetNullUniqueUserFieldsInMongo } from "../src/lib/prisma/mongoUniqueOptionalFields";

const prisma = new PrismaClient();

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
  // Prisma db push may create a non-sparse unique index; replace with sparse so
  // many users without a referral invite do not collide on null.
  await dropIndex("users", "users_referredByInviteId_key");
  await unsetNullUniqueUserFieldsInMongo((command) =>
    prisma.$runCommandRaw(command)
  );
  await createIndex(
    "users",
    { referredByInviteId: 1 },
    {
      name: "users_referredByInviteId_key",
      unique: true,
      sparse: true,
    }
  );

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

  // Legacy one-active-order-per-fund unique index — slot cap replaces this.
  await dropIndex("purchaseorders", "user_1_fundId_1_active_unique");

  await createIndex(
    "purchaseorders",
    { user: 1, fundId: 1, status: 1 },
    {
      name: "user_1_fundId_1_status",
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

  await createIndex(
    "playerpoweruses",
    { investmentId: 1 },
    {
      name: "playerpoweruses_investmentId_key",
      unique: true,
    }
  );

  await createIndex(
    "playerpoweruses",
    { userId: 1, powerType: 1 },
    {
      name: "playerpoweruses_userId_powerType_idx",
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
