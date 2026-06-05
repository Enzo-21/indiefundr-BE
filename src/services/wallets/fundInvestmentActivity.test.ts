import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PurchaseOrderStatus } from "@prisma/client";
import {
  buildHiddenFailedUsdtTxIds,
  collectWinningPaymentTxIds,
  fundInvestmentActivityId,
  shouldSkipInvestmentActivityRow,
} from "./fundInvestmentActivity";

describe("fundInvestmentActivity", () => {
  it("uses purchase-order activity id", () => {
    assert.equal(fundInvestmentActivityId("ord-1"), "purchase-order-ord-1");
  });

  it("hides failed USDT retry tx ids but keeps winning tx", () => {
    const hidden = buildHiddenFailedUsdtTxIds([
      {
        id: "o1",
        status: PurchaseOrderStatus.processing,
        usdtTxId: "win-tx",
        failedUsdtTxIds: ["fail-tx", "win-tx"],
      },
    ]);
    assert.equal(hidden.has("fail-tx"), true);
    assert.equal(hidden.has("win-tx"), false);
  });

  it("collects winning payment tx ids", () => {
    const winning = collectWinningPaymentTxIds([
      {
        usdtTxId: "done-tx",
        failedUsdtTxIds: [],
        paymentChainOutcome: null,
        status: PurchaseOrderStatus.completed,
      },
    ]);
    assert.equal(winning.has("done-tx"), true);
  });

  it("skips investment activity when order is in flight and defer is on", () => {
    assert.equal(
      shouldSkipInvestmentActivityRow(
        { id: "o1", status: PurchaseOrderStatus.processing },
        true
      ),
      true
    );
    assert.equal(
      shouldSkipInvestmentActivityRow(
        { id: "o1", status: PurchaseOrderStatus.completed },
        true
      ),
      false
    );
  });
});
