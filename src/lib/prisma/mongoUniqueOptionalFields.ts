/** Optional @unique fields on MongoDB must be unset, not stored as null. */
export const MONGO_UNSET_NULL_UNIQUE_USER_FIELDS = [
  "referredByInviteId",
] as const;

export function stripMongoUnsetNullUniqueUserFields<
  T extends Record<string, unknown> | undefined,
>(data: T): T {
  if (!data) {
    return data;
  }
  for (const field of MONGO_UNSET_NULL_UNIQUE_USER_FIELDS) {
    if (data[field] === null) {
      delete data[field];
    }
  }
  return data;
}

export async function unsetNullUniqueUserFieldsInMongo(
  runCommandRaw: (command: Record<string, unknown>) => Promise<unknown>
): Promise<void> {
  for (const field of MONGO_UNSET_NULL_UNIQUE_USER_FIELDS) {
    const result = await runCommandRaw({
      update: "users",
      updates: [
        {
          q: { [field]: null },
          u: { $unset: { [field]: "" } },
          multi: true,
        },
      ],
    });
    const payload = result as { nModified?: number; n?: number };
    const modified = payload.nModified ?? payload.n ?? 0;
    console.log(`Unset ${field} on ${modified} user(s)`);
  }
}
