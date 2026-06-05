import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetEnvCache } from "@/lib/env";
import { shouldLogLoginOtpToConsole } from "./devLoginOtpLog";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
  resetEnvCache();
}

describe("shouldLogLoginOtpToConsole", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("is false in production", () => {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_DOMAIN = "http://localhost:8081";
    resetEnvCache();
    assert.equal(shouldLogLoginOtpToConsole(), false);
  });

  it("is true in development with empty FRONTEND_DOMAIN", () => {
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL;
    process.env.FRONTEND_DOMAIN = "";
    resetEnvCache();
    assert.equal(shouldLogLoginOtpToConsole(), true);
  });

  it("is false in development when FRONTEND_DOMAIN is not localhost", () => {
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL;
    process.env.FRONTEND_DOMAIN = "https://app.example.com";
    resetEnvCache();
    assert.equal(shouldLogLoginOtpToConsole(), false);
  });
});
