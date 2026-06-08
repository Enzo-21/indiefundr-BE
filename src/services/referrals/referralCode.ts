import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import type { ReferralCode } from "@prisma/client";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export function buildShareUrl(code: string): string {
  const env = getEnv();
  const base = env.appWebUrl?.replace(/\/$/, "") || "https://app.indiefundr.com";
  return `${base}/invite?code=${encodeURIComponent(code)}`;
}

export async function getOrCreateReferralCode(userId: string): Promise<ReferralCode> {
  const existing = await prisma.referralCode.findUnique({ where: { userId } });
  if (existing) return existing;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    try {
      return await prisma.referralCode.create({
        data: { userId, code },
      });
    } catch {
      const dup = await prisma.referralCode.findUnique({ where: { userId } });
      if (dup) return dup;
    }
  }

  throw new Error("Failed to generate unique referral code");
}

export async function findReferralCodeByCode(
  rawCode: string
): Promise<(ReferralCode & { owner: { id: string; email: string } }) | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  return prisma.referralCode.findFirst({
    where: { code: { equals: code, mode: "insensitive" } },
    include: { owner: { select: { id: true, email: true } } },
  });
}
