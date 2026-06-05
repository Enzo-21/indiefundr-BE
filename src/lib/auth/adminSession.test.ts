import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetEnvCache } from "@/lib/env";
import { AuthError } from "./errors";
import {
  createAdminSessionToken,
  parseAdminSessionToken,
  verifyAdminApiKeyValue,
} from "./adminSession";

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "mongodb://127.0.0.1:27017/test";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test";

describe("adminSession", () => {
  it("creates and parses a valid session token", () => {
    resetEnvCache();
    process.env.ADMIN_ALLOWED_EMAIL = "admin@example.com";
    const token = createAdminSessionToken({
      email: "admin@example.com",
      createdBy: "operator",
    });
    const payload = parseAdminSessionToken(token);
    assert.equal(payload.sub, "admin");
    assert.equal(payload.email, "admin@example.com");
    assert.equal(payload.createdBy, "operator");
    assert.ok(payload.exp > Date.now());
  });

  it("rejects missing token", () => {
    resetEnvCache();
    process.env.ADMIN_ALLOWED_EMAIL = "admin@example.com";
    assert.throws(
      () => parseAdminSessionToken(null),
      (err: unknown) => err instanceof AuthError && err.status === 401
    );
  });

  it("rejects tampered token", () => {
    resetEnvCache();
    process.env.ADMIN_ALLOWED_EMAIL = "admin@example.com";
    const token = createAdminSessionToken({ email: "admin@example.com" });
    assert.throws(
      () => parseAdminSessionToken(`${token}x`),
      (err: unknown) => err instanceof AuthError && err.status === 401
    );
  });

  it("returns 503 when admin email is not configured", () => {
    resetEnvCache();
    process.env.ADMIN_ALLOWED_EMAIL = "";
    assert.throws(
      () => parseAdminSessionToken("anything"),
      (err: unknown) => err instanceof AuthError && err.status === 503
    );
  });

  it("verifyAdminApiKeyValue accepts matching key", () => {
    resetEnvCache();
    process.env.ADMIN_API_KEY = "secret-admin-key";
    assert.doesNotThrow(() => verifyAdminApiKeyValue("secret-admin-key"));
  });

  it("verifyAdminApiKeyValue rejects wrong key", () => {
    resetEnvCache();
    process.env.ADMIN_API_KEY = "secret-admin-key";
    assert.throws(
      () => verifyAdminApiKeyValue("wrong"),
      (err: unknown) => err instanceof AuthError && err.status === 401
    );
  });
});
