import { PrismaClient } from "@prisma/client";
import { stripMongoUnsetNullUniqueUserFields } from "@/lib/prisma/mongoUniqueOptionalFields";

export const GLOBAL_LEDGER_ID = "global";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient().$extends({
    query: {
      user: {
        create({ args, query }) {
          stripMongoUnsetNullUniqueUserFields(
            args.data as Record<string, unknown> | undefined
          );
          return query(args);
        },
        createMany({ args, query }) {
          const rows = args.data;
          if (Array.isArray(rows)) {
            for (const row of rows) {
              stripMongoUnsetNullUniqueUserFields(
                row as Record<string, unknown>
              );
            }
          } else {
            stripMongoUnsetNullUniqueUserFields(
              rows as Record<string, unknown> | undefined
            );
          }
          return query(args);
        },
        update({ args, query }) {
          stripMongoUnsetNullUniqueUserFields(
            args.data as Record<string, unknown> | undefined
          );
          return query(args);
        },
        updateMany({ args, query }) {
          stripMongoUnsetNullUniqueUserFields(
            args.data as Record<string, unknown> | undefined
          );
          return query(args);
        },
        upsert({ args, query }) {
          stripMongoUnsetNullUniqueUserFields(
            args.create as Record<string, unknown> | undefined
          );
          stripMongoUnsetNullUniqueUserFields(
            args.update as Record<string, unknown> | undefined
          );
          return query(args);
        },
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma as unknown as PrismaClient;
}
