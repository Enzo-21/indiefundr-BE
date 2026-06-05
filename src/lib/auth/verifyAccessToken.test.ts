import assert from "node:assert/strict";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { verifyAccessToken } from "./verifyAccessToken";
import { AuthError } from "./errors";

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret-for-verify";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "mongodb://127.0.0.1:27017/test";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test";

describe("verifyAccessToken", () => {
  it("extracts userId from valid token", () => {
    const token = jwt.sign(
      { user: { id: "user-abc-123" } },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: "1h" }
    );
    const user = verifyAccessToken(token);
    assert.equal(user.id, "user-abc-123");
  });

  it("throws TOKEN_EXPIRED for expired token", () => {
    const token = jwt.sign(
      { user: { id: "user-1" } },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: -1 }
    );
    assert.throws(
      () => verifyAccessToken(token),
      (err: unknown) =>
        err instanceof AuthError &&
        err.code === "TOKEN_EXPIRED" &&
        err.status === 401
    );
  });

  it("throws NO_TOKEN when token missing", () => {
    assert.throws(
      () => verifyAccessToken(null),
      (err: unknown) => err instanceof AuthError && err.code === "NO_TOKEN"
    );
  });
});
