import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withdrawalMetaKey } from "./hydrateWithdrawalActivityMeta";

describe("withdrawalMetaKey", () => {
  it("builds keys for withdrawal and withdrawal_order kinds", () => {
    assert.equal(withdrawalMetaKey("withdrawal", "abc"), "withdrawal:abc");
    assert.equal(
      withdrawalMetaKey("withdrawal_order", "abc"),
      "withdrawal_order:abc"
    );
  });
});
