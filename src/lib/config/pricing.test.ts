import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertEnv } from "@/lib/env";
import { INVESTMENT_FUNDS, projectedPayoutUsdt } from "./pricing";

describe("pricing", () => {
  it("projectedPayoutUsdt(25, 40) === 35", () => {
    assert.equal(projectedPayoutUsdt(25, 40), 35);
  });

  it("fund catalog includes all five fundId values", () => {
    const ids = INVESTMENT_FUNDS.map((f) => f.id);
    assert.deepEqual(ids, [
      "aggressive-alpha",
      "growth-partners",
      "balanced-growth",
      "stable-yield",
      "capital-shield",
    ]);
  });
});

describe("assertEnv", () => {
  it("throws when JWT access secret is missing", () => {
    const base = { ...process.env };
    const withoutJwt = {
      ...base,
      DATABASE_URL: base.DATABASE_URL || "mongodb://localhost:27017/test",
      MONGO_URI: base.MONGO_URI || "mongodb://localhost:27017/test",
      JWT_ACCESS_SECRET: "",
      JWT_SECRET: "",
      JWT_REFRESH_SECRET: base.JWT_REFRESH_SECRET || "refresh-secret",
      RESEND_API_KEY: base.RESEND_API_KEY || "re_test",
    };

    assert.throws(
      () => assertEnv(withoutJwt),
      /Missing required environment variables/
    );
  });
});
