import { PrismaClient } from "@prisma/client";
import { stripMongoUnsetNullUniqueUserFields } from "@/lib/prisma/mongoUniqueOptionalFields";

export const GLOBAL_LEDGER_ID = "global";

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

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

const extendedPrisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = extendedPrisma;
}

/** Cast keeps Prisma $extends compatible with existing PrismaClient typings. */
export const prisma = extendedPrisma as unknown as PrismaClient;
