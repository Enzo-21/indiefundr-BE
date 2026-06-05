import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import {
  hashRefreshToken,
  issueTokenPair,
  revokeFamily,
  rotateRefreshToken,
} from "./tokens";

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("hashRefreshToken", () => {
  it("is deterministic", () => {
    const raw = "sample-refresh-token-value";
    assert.equal(hashRefreshToken(raw), hashRefreshToken(raw));
    assert.notEqual(hashRefreshToken(raw), hashRefreshToken(`${raw}x`));
  });
});

describe("issueTokenPair", () => {
  it(
    "creates refresh session",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Test User",
          email: `test-${Date.now()}@example.com`,
        },
      });

      const pair = await issueTokenPair(user.id);
      assert.ok(pair.accessToken);
      assert.ok(pair.refreshToken);
      assert.equal(typeof pair.expiresIn, "number");

      const hash = hashRefreshToken(pair.refreshToken);
      const session = await prisma.refreshSession.findUnique({
        where: { tokenHash: hash },
      });
      assert.ok(session);
      assert.equal(session.userId, user.id);
      assert.equal(session.revokedAt, null);

      await cleanupUserSessions(user.id);
    }
  );
});

async function cleanupUserSessions(userId: string) {
  await prisma.refreshSession.updateMany({
    where: { userId },
    data: { replacedById: null },
  });
  await prisma.refreshSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

describe("rotateRefreshToken", () => {
  it(
    "invalidates old refresh and issues new pair",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Rotate User",
          email: `rotate-${Date.now()}@example.com`,
        },
      });

      const initial = await issueTokenPair(user.id);
      const oldRefresh = initial.refreshToken;

      const rotated = await rotateRefreshToken(oldRefresh);
      assert.equal(rotated.ok, true);
      if (!rotated.ok) return;
      assert.ok(rotated.accessToken);
      assert.ok(rotated.refreshToken);
      assert.notEqual(rotated.refreshToken, oldRefresh);

      const oldHash = hashRefreshToken(oldRefresh);
      const oldSession = await prisma.refreshSession.findUnique({
        where: { tokenHash: oldHash },
      });
      assert.ok(oldSession?.revokedAt);

      const reuse = await rotateRefreshToken(oldRefresh);
      assert.equal(reuse.ok, false);
      if (reuse.ok) return;
      assert.equal(reuse.code, "REUSE_DETECTED");

      await cleanupUserSessions(user.id);
    }
  );
});

describe("revokeFamily", () => {
  it(
    "marks all sessions in family revoked",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Family User",
          email: `family-${Date.now()}@example.com`,
        },
      });

      const pair = await issueTokenPair(user.id);
      const session = await prisma.refreshSession.findUnique({
        where: { tokenHash: hashRefreshToken(pair.refreshToken) },
      });
      assert.ok(session);

      await revokeFamily(session.familyId);

      const updated = await prisma.refreshSession.findUnique({
        where: { id: session.id },
      });
      assert.ok(updated?.revokedAt);

      await cleanupUserSessions(user.id);
    }
  );
});
