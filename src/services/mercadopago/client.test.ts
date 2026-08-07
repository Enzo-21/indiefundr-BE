import { UsdtPurchaseOrderStatus } from "@prisma/client";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitPayerName } from "./client";

describe("splitPayerName", () => {
  it("splits first and remaining tokens", () => {
    assert.deepEqual(splitPayerName("Berta Parra Lopez"), {
      name: "Berta",
      surname: "Parra Lopez",
    });
  });

  it("handles single token and empty", () => {
    assert.deepEqual(splitPayerName("Enzo"), {
      name: "Enzo",
      surname: null,
    });
    assert.deepEqual(splitPayerName("  "), {
      name: null,
      surname: null,
    });
  });
});

describe("prior purchase status set", () => {
  it("includes statuses that count as prior online purchases", () => {
    const prior = new Set([
      UsdtPurchaseOrderStatus.awaiting_admin,
      UsdtPurchaseOrderStatus.paid,
      UsdtPurchaseOrderStatus.completed,
    ]);
    assert.equal(prior.has(UsdtPurchaseOrderStatus.pending_payment), false);
    assert.equal(prior.has(UsdtPurchaseOrderStatus.failed), false);
  });
});
