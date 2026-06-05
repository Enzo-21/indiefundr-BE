import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import {
  clearDeviceToken,
  getUserById,
  setDeviceToken,
  welcomeUser,
} from "./user";

import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("getUserById", () => {
  it("rejects invalid object id", async () => {
    const result = await getUserById("not-an-object-id");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.deepEqual(result.body, { msg: "User not found" });
    }
  });

  it(
    "returns user when found",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Lookup User",
          email: `lookup-${Date.now()}@example.com`,
        },
      });

      const result = await getUserById(user.id);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.id, user.id);
      }

      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});

describe("welcomeUser", () => {
  it(
    "sets firstTime to false",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Welcome User",
          email: `welcome-${Date.now()}@example.com`,
          firstTime: true,
        },
      });

      const result = await welcomeUser(user.id);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data, "User has been welcomed");
      }

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      assert.equal(updated?.firstTime, false);

      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});

describe("device token", () => {
  it(
    "set and clear device",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Device User",
          email: `device-${Date.now()}@example.com`,
        },
      });

      const setResult = await setDeviceToken(user.id, "expo-token-123");
      assert.equal(setResult.ok, true);
      if (setResult.ok) {
        assert.equal(setResult.data.device, "expo-token-123");
      }

      const missing = await setDeviceToken(user.id, undefined);
      assert.equal(missing.ok, false);

      const clearResult = await clearDeviceToken(user.id);
      assert.equal(clearResult.ok, true);
      if (clearResult.ok) {
        assert.equal(clearResult.data.device, null);
      }

      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
