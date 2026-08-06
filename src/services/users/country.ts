import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ISO_ALPHA2 = /^[A-Za-z]{2}$/;

export type UpdateCountryResult =
  | { ok: true; user: User }
  | { ok: false; status: number; body: Record<string, unknown> };

export function normalizeCountryInput(
  raw: unknown
): { ok: true; country: string | null } | { ok: false; msg: string } {
  if (raw === null) {
    return { ok: true, country: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, msg: "country must be a string or null" };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, country: null };
  }
  if (!ISO_ALPHA2.test(trimmed)) {
    return {
      ok: false,
      msg: "country must be a 2-letter ISO 3166-1 alpha-2 code",
    };
  }
  return { ok: true, country: trimmed.toUpperCase() };
}

export async function updateCountry(
  userId: string,
  rawCountry: unknown
): Promise<UpdateCountryResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, status: 400, body: { msg: "User not found" } };
  }

  const normalized = normalizeCountryInput(rawCountry);
  if (!normalized.ok) {
    return { ok: false, status: 400, body: { msg: normalized.msg } };
  }

  if (user.country === normalized.country) {
    return { ok: true, user };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { country: normalized.country },
  });

  return { ok: true, user: updated };
}
