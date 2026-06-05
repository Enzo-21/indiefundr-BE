import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetEnvCache } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  isAdminAllowedEmail,
  requestAdminOtp,
  verifyAdminOtp,
} from "./auth";

import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test";

describe("admin auth service", () => {
  it("isAdminAllowedEmail matches env only", () => {
    resetEnvCache();
    process.env.ADMIN_ALLOWED_EMAIL = "allowed@example.com";
    assert.equal(isAdminAllowedEmail("allowed@example.com"), true);
    assert.equal(isAdminAllowedEmail("other@example.com"), false);
  });

  it(
    "requestAdminOtp returns generic success for disallowed email",
    { skip: skipDbTests },
    async () => {
      resetEnvCache();
      process.env.ADMIN_ALLOWED_EMAIL = "allowed@example.com";
      const result = await requestAdminOtp("stranger@example.com");
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.match(result.message, /authorized/i);
      }
      const count = await prisma.adminLoginOtp.count({
        where: { email: "stranger@example.com" },
      });
      assert.equal(count, 0);
    }
  );

  it(
    "verifyAdminOtp rejects invalid code",
    { skip: skipDbTests },
    async () => {
      resetEnvCache();
      process.env.ADMIN_ALLOWED_EMAIL = "allowed@example.com";
      await prisma.adminLoginOtp.deleteMany({
        where: { email: "allowed@example.com" },
      });
      const result = await verifyAdminOtp("allowed@example.com", "000000");
      assert.equal(result.ok, false);
    }
  );
});
