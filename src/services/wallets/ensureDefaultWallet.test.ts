import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEnsureWalletStatus } from "./ensureDefaultWallet";

describe("resolveEnsureWalletStatus", () => {
  it("returns ready when wallet count is positive", () => {
    assert.deepEqual(resolveEnsureWalletStatus(2, false), { status: "ready" });
  });

  it("returns created when count is zero and create succeeded", () => {
    assert.deepEqual(resolveEnsureWalletStatus(0, true), { status: "created" });
  });

  it("returns failed when count is zero and create failed", () => {
    const result = resolveEnsureWalletStatus(0, false);
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.ok(result.error);
    }
  });
});
