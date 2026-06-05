import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSiblingDeferRecoveryReason } from "./siblingOpenOrders";

describe("formatSiblingDeferRecoveryReason", () => {
  it("uses singular order when total is 1", () => {
    const message = formatSiblingDeferRecoveryReason({
      investmentOrders: 1,
      withdrawalOrders: 0,
      total: 1,
    });
    assert.match(message, /1 other open order/);
    assert.match(message, /saving sponsored TRX/);
  });

  it("uses plural orders when total is greater than 1", () => {
    const message = formatSiblingDeferRecoveryReason({
      investmentOrders: 1,
      withdrawalOrders: 1,
      total: 2,
    });
    assert.match(message, /2 other open orders/);
  });
});
