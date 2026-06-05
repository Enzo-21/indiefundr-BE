import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type RotateRefreshResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number }
  | { ok: false; status: number; code: string; msg: string };

function accessSecret() {
  return getEnv().jwtAccessSecret;
}

function refreshTokenTtlDays() {
  return getEnv().refreshTokenTtlDays;
}

export function accessExpiresSeconds(): number {
  const ttl = getEnv().accessTokenTtl;
  if (ttl === "1h") return 3600;
  if (ttl.endsWith("m")) return parseInt(ttl, 10) * 60;
  if (ttl.endsWith("h")) return parseInt(ttl, 10) * 3600;
  if (ttl.endsWith("d")) return parseInt(ttl, 10) * 86400;
  return 3600;
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateOpaqueRefreshToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function refreshExpiresAt(): Date {
  const days = refreshTokenTtlDays();
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function signAccessToken(userId: string): Promise<string> {
  const payload = { user: { id: String(userId) } };
  return new Promise((resolve, reject) => {
    jwt.sign(
      payload,
      accessSecret(),
      { expiresIn: accessExpiresSeconds() },
      (err, token) => {
        if (err) reject(err);
        else resolve(token!);
      }
    );
  });
}

async function createRefreshSession(
  userId: string,
  familyId: string,
  metadata: { userAgent?: string | null } = {}
) {
  const rawRefreshToken = generateOpaqueRefreshToken();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const session = await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash,
      familyId,
      expiresAt: refreshExpiresAt(),
      userAgent: metadata.userAgent ?? null,
    },
  });

  return { rawRefreshToken, session };
}

export async function issueTokenPair(
  userId: string,
  metadata: { userAgent?: string | null } = {}
): Promise<TokenPair> {
  const familyId = crypto.randomUUID();
  const accessToken = await signAccessToken(userId);
  const { rawRefreshToken } = await createRefreshSession(userId, familyId, metadata);

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: accessExpiresSeconds(),
  };
}

export async function revokeFamily(familyId: string): Promise<void> {
  const sessions = await prisma.refreshSession.findMany({
    where: { familyId },
  });
  const now = new Date();
  await Promise.all(
    sessions
      .filter((session) => !session.revokedAt)
      .map((session) =>
        prisma.refreshSession.update({
          where: { id: session.id },
          data: { revokedAt: now },
        })
      )
  );
}

export async function rotateRefreshToken(
  rawRefreshToken: string
): Promise<RotateRefreshResult> {
  if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
    return {
      ok: false,
      status: 401,
      code: "INVALID_TOKEN",
      msg: "Invalid refresh token",
    };
  }

  const tokenHash = hashRefreshToken(rawRefreshToken);
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash },
  });

  if (!session) {
    return {
      ok: false,
      status: 401,
      code: "INVALID_TOKEN",
      msg: "Invalid refresh token",
    };
  }

  if (session.revokedAt) {
    await revokeFamily(session.familyId);
    return {
      ok: false,
      status: 401,
      code: "REUSE_DETECTED",
      msg: "Refresh token reuse detected. Please sign in again.",
    };
  }

  if (session.expiresAt < new Date()) {
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return {
      ok: false,
      status: 401,
      code: "INVALID_TOKEN",
      msg: "Refresh token expired",
    };
  }

  const { rawRefreshToken: newRaw, session: newSession } =
    await createRefreshSession(session.userId, session.familyId, {
      userAgent: session.userAgent,
    });

  await prisma.refreshSession.update({
    where: { id: session.id },
    data: {
      revokedAt: new Date(),
      replacedById: newSession.id,
      lastUsedAt: new Date(),
    },
  });

  const accessToken = await signAccessToken(session.userId);

  return {
    ok: true,
    accessToken,
    refreshToken: newRaw,
    expiresIn: accessExpiresSeconds(),
  };
}

export async function revokeRefreshToken(rawRefreshToken: string): Promise<boolean> {
  if (!rawRefreshToken) return false;

  const tokenHash = hashRefreshToken(rawRefreshToken);
  const result = await prisma.refreshSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
