import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetEnvCache } from "@/lib/env";
import { verifyAdminApiKey } from "./verifyAdminApiKey";
import { AuthError } from "./errors";

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "mongodb://127.0.0.1:27017/test";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test";

describe("verifyAdminApiKey", () => {
  it("accepts x-admin-api-key header", () => {
    resetEnvCache();
    process.env.ADMIN_API_KEY = "secret-admin-key";
    const request = new Request("http://localhost", {
      headers: { "x-admin-api-key": "secret-admin-key" },
    });
    assert.doesNotThrow(() => verifyAdminApiKey(request));
  });

  it("rejects wrong key", () => {
    resetEnvCache();
    process.env.ADMIN_API_KEY = "secret-admin-key";
    const request = new Request("http://localhost", {
      headers: { "x-admin-api-key": "wrong" },
    });
    assert.throws(
      () => verifyAdminApiKey(request),
      (err: unknown) => err instanceof AuthError && err.status === 401
    );
  });

  it("returns 503 when admin key not configured", () => {
    resetEnvCache();
    process.env.ADMIN_API_KEY = "";
    const request = new Request("http://localhost", {
      headers: { "x-admin-api-key": "anything" },
    });
    assert.throws(
      () => verifyAdminApiKey(request),
      (err: unknown) => err instanceof AuthError && err.status === 503
    );
  });
});
