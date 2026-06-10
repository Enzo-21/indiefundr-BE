import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { authorizeCronRequest } from "./authorizeCronRequest";

describe("authorizeCronRequest", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("allows bearer token when CRON_SECRET is set", () => {
    process.env.CRON_SECRET = "test-secret";
    process.env.NODE_ENV = "production";
    const request = new Request("http://localhost/api/cron/maturity", {
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(authorizeCronRequest(request), true);
  });

  it("allows x-vercel-cron when CRON_SECRET is set", () => {
    process.env.CRON_SECRET = "test-secret";
    process.env.NODE_ENV = "production";
    const request = new Request("http://localhost/api/cron/maturity", {
      headers: { "x-vercel-cron": "1" },
    });
    assert.equal(authorizeCronRequest(request), true);
  });

  it("rejects missing auth in production when CRON_SECRET is set", () => {
    process.env.CRON_SECRET = "test-secret";
    process.env.NODE_ENV = "production";
    const request = new Request("http://localhost/api/cron/maturity");
    assert.equal(authorizeCronRequest(request), false);
  });

  it("allows dev requests when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    process.env.NODE_ENV = "development";
    const request = new Request("http://localhost/api/cron/maturity");
    assert.equal(authorizeCronRequest(request), true);
  });
});
