export const DEFAULT_WALLET_ACTIVITY_PAGE_LIMIT = 10;
export const MAX_WALLET_ACTIVITY_PAGE_LIMIT = 50;

export type ActivityCursorPayload = {
  occurredAt: string;
  id: string;
};

export function clampActivityPageLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) {
    return DEFAULT_WALLET_ACTIVITY_PAGE_LIMIT;
  }
  const rounded = Math.floor(limit);
  if (rounded < 1) {
    return DEFAULT_WALLET_ACTIVITY_PAGE_LIMIT;
  }
  return Math.min(rounded, MAX_WALLET_ACTIVITY_PAGE_LIMIT);
}

export function encodeActivityCursor(
  occurredAt: Date,
  id: string
): string {
  const payload: ActivityCursorPayload = {
    occurredAt: occurredAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeActivityCursor(
  cursor: string | undefined | null
): ActivityCursorPayload | null {
  if (!cursor?.trim()) {
    return null;
  }
  try {
    const raw = Buffer.from(cursor.trim(), "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as ActivityCursorPayload;
    if (
      typeof parsed.occurredAt !== "string" ||
      typeof parsed.id !== "string" ||
      !parsed.id.trim()
    ) {
      return null;
    }
    const occurredAt = new Date(parsed.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      return null;
    }
    return { occurredAt: parsed.occurredAt, id: parsed.id };
  } catch {
    return null;
  }
}
