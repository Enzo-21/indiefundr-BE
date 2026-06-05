import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLedgerSnapshot } from "./ledger";
import { requestWithdrawal } from "./withdrawals";

describe("treasury server actions", () => {
  it("getLedgerSnapshot returns error without admin session", async () => {
    const result = await getLedgerSnapshot();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.code);
      assert.ok(result.error.msg);
    }
    assert.equal("data" in result, false);
  });

  it("requestWithdrawal rejects non-positive amount before auth", async () => {
    const result = await requestWithdrawal({ amountUsdt: 0 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "BAD_REQUEST");
      assert.match(result.error.msg, /positive/i);
    }
    assert.equal("data" in result, false);
  });
});
