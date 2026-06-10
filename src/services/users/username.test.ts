import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { allocateUniqueUsername } from "@/lib/users/username";
import { updateUsername } from "./username";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("allocateUniqueUsername", () => {
  it(
    "appends collision suffix when base username is taken",
    { skip: skipDbTests },
    async () => {
      const suffix = Date.now();
      const emailA = `user@gmail-${suffix}.test`;
      const emailB = `User@yahoo-${suffix}.test`;

      const first = await allocateUniqueUsername(emailA);
      assert.equal(first, "user");

      await prisma.user.create({
        data: {
          name: "Taken",
          email: emailA,
          username: first,
        },
      });

      const second = await allocateUniqueUsername(emailB);
      assert.match(second, /^user_[a-z0-9]{4}$/);

      await prisma.user.deleteMany({
        where: { email: { in: [emailA, emailB] } },
      });
    }
  );
});

describe("updateUsername", () => {
  it(
    "returns 409 when username is already taken",
    { skip: skipDbTests },
    async () => {
      const suffix = Date.now();
      const takenEmail = `taken-${suffix}@example.com`;
      const otherEmail = `other-${suffix}@example.com`;

      const takenUser = await prisma.user.create({
        data: {
          name: "Taken User",
          email: takenEmail,
          username: `taken_${suffix}`,
        },
      });

      const otherUser = await prisma.user.create({
        data: {
          name: "Other User",
          email: otherEmail,
          username: `other_${suffix}`,
        },
      });

      const result = await updateUsername(otherUser.id, `taken_${suffix}`);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 409);
        assert.equal(result.body.code, "username_taken");
      }

      await prisma.user.deleteMany({
        where: { id: { in: [takenUser.id, otherUser.id] } },
      });
    }
  );
});
