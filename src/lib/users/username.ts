import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const MAX_USERNAME_LENGTH = 30;
const FALLBACK_BASE = "investor";
const COLLISION_SUFFIX_LENGTH = 4;
const MAX_ALLOCATE_ATTEMPTS = 20;

const RESERVED_USERNAMES = new Set([
  "admin",
  "support",
  "indiefundr",
  "help",
  "api",
  "root",
  "system",
  "www",
  "mail",
  "null",
]);

export type UsernameValidationResult =
  | { ok: true; username: string }
  | { ok: false; msg: string };

export function deriveBaseUsernameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  let base = localPart.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  base = base.replace(/_+/g, "_").replace(/^_+|_+$/g, "");

  if (!base) {
    base = FALLBACK_BASE;
  }

  if (base.length > MAX_USERNAME_LENGTH) {
    base = base.slice(0, MAX_USERNAME_LENGTH).replace(/_+$/, "");
    if (!base) {
      base = FALLBACK_BASE.slice(0, MAX_USERNAME_LENGTH);
    }
  }

  return base;
}

function randomAlnum(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

export function buildCollisionUsername(base: string): string {
  const maxBaseLen = MAX_USERNAME_LENGTH - 1 - COLLISION_SUFFIX_LENGTH;
  let truncated = base.length > maxBaseLen ? base.slice(0, maxBaseLen) : base;
  truncated = truncated.replace(/_+$/, "");
  if (!truncated) {
    truncated = FALLBACK_BASE.slice(0, maxBaseLen);
  }
  return `${truncated}_${randomAlnum(COLLISION_SUFFIX_LENGTH)}`;
}

export async function isUsernameTaken(
  username: string,
  excludeUserId?: string
): Promise<boolean> {
  const existing = await prisma.user.findFirst({
    where: {
      username,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

export function validateUsernameInput(raw: string): UsernameValidationResult {
  const normalized = raw.trim().toLowerCase();

  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      ok: false,
      msg: "Username must be 3–30 characters: lowercase letters, numbers, and underscores only.",
    };
  }

  if (RESERVED_USERNAMES.has(normalized)) {
    return { ok: false, msg: "This username is reserved." };
  }

  return { ok: true, username: normalized };
}

export async function allocateUniqueUsername(email: string): Promise<string> {
  const base = deriveBaseUsernameFromEmail(email);

  if (!(await isUsernameTaken(base))) {
    return base;
  }

  for (let attempt = 0; attempt < MAX_ALLOCATE_ATTEMPTS; attempt++) {
    const candidate = buildCollisionUsername(base);
    if (!(await isUsernameTaken(candidate))) {
      return candidate;
    }
  }

  throw new Error("Failed to allocate unique username");
}

export function formatPublicUsername(
  username: string | null | undefined,
  fallback = "Friend"
): string {
  const trimmed = username?.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}
