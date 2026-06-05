import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWalletActivitySyncStatus } from "./wallets";

describe("getWalletActivitySyncStatus", () => {
  it("returns 400 for invalid wallet id", async () => {
    const result = await getWalletActivitySyncStatus("user-id", "not-valid");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  });

  it("returns 404 when wallet is not found", async () => {
    const result = await getWalletActivitySyncStatus(
      "507f1f77bcf86cd799439011",
      "507f1f77bcf86cd799439012"
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
    }
  });
});
