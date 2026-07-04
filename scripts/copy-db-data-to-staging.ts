/**
 * Copy all collections from MongoDB database `data` → `staging`.
 * Connection string database name is the DB, not a collection.
 *
 * Usage: npx tsx scripts/copy-db-data-to-staging.ts
 * Optional: DRY_RUN=1 to list collections only
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

const SOURCE_DB = "data";
const TARGET_DB = "staging";

function swapDatabaseInUrl(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

async function main() {
  const baseUrl = process.env.DATABASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const sourceUrl = swapDatabaseInUrl(baseUrl, SOURCE_DB);
  const targetUrl = swapDatabaseInUrl(baseUrl, TARGET_DB);
  const dryRun = process.env.DRY_RUN === "1";

  const sourceClient = new MongoClient(sourceUrl);
  await sourceClient.connect();
  const sourceDb = sourceClient.db(SOURCE_DB);

  const collections = (await sourceDb.listCollections().toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."));

  console.log(`Source database "${SOURCE_DB}": ${collections.length} collection(s)`);
  for (const name of collections) {
    const count = await sourceDb.collection(name).countDocuments();
    console.log(`  - ${name}: ${count} document(s)`);
  }

  if (dryRun) {
    console.log("DRY_RUN=1 — no copy performed.");
    await sourceClient.close();
    return;
  }

  if (collections.length === 0) {
    console.log("Nothing to copy.");
    await sourceClient.close();
    return;
  }

  const targetClient = new MongoClient(targetUrl);
  await targetClient.connect();
  const targetDb = targetClient.db(TARGET_DB);

  for (const name of collections) {
    const existing = await targetDb.collection(name).countDocuments();
    if (existing > 0) {
      console.log(`Skipping ${name}: target already has ${existing} document(s).`);
      continue;
    }

    console.log(`Copying ${name}...`);
    const cursor = sourceDb.collection(name).find({});
    const docs = await cursor.toArray();
    if (docs.length === 0) {
      console.log(`  (empty collection, ensuring it exists)`);
      await targetDb.createCollection(name);
      continue;
    }
    await targetDb.collection(name).insertMany(docs, { ordered: false });
    console.log(`  copied ${docs.length} document(s)`);
  }

  await sourceClient.close();
  await targetClient.close();
  console.log(`Done. Database "${TARGET_DB}" is ready.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
