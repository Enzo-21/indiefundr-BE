import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PurchaseOrderStatus } from "@prisma/client";
import { isPaymentChainOutcomeFinal } from "./paymentChainState";

describe("isPaymentChainOutcomeFinal", () => {
  it("treats completed orders as final regardless of outcome", () => {
    assert.equal(
      isPaymentChainOutcomeFinal("unknown", PurchaseOrderStatus.completed),
      true
    );
  });

  it("treats on-chain success as final", () => {
    assert.equal(
      isPaymentChainOutcomeFinal("success", PurchaseOrderStatus.processing),
      true
    );
  });

  it("treats failed outcome on failed order as final", () => {
    assert.equal(
      isPaymentChainOutcomeFinal("failed", PurchaseOrderStatus.failed),
      true
    );
  });

  it("does not finalize pending outcome on processing order", () => {
    assert.equal(
      isPaymentChainOutcomeFinal("pending", PurchaseOrderStatus.processing),
      false
    );
  });
});
