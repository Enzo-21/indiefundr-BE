/**
 * MongoDB optional fields omitted at insert are unset, not SQL null.
 * Prisma `{ field: null }` only matches explicit nulls — use these helpers in where clauses.
 */
export function fieldIsNullOrUnset(field: string) {
  return {
    OR: [{ [field]: null }, { [field]: { isSet: false } }],
  };
}

export function fieldIsSet(field: string) {
  return { [field]: { isSet: true } };
}
