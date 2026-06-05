import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { PurchaseOrderStatus } from "@prisma/client";
import { resetEnvCache } from "@/lib/env";
import {
  processActivePurchaseOrdersForWallet,
  runScheduledPurchaseOrderHeal,
  stalePurchaseOrderCandidateWhere,
} from "./purchaseOrderProcessor";

describe("runScheduledPurchaseOrderHeal", () => {
  const originalHealEnabled = process.env.PURCHASE_ORDER_HEAL_ENABLED;
  const originalHealMax = process.env.PURCHASE_ORDER_HEAL_MAX_PER_RUN;

  after(() => {
    if (originalHealEnabled === undefined) {
      delete process.env.PURCHASE_ORDER_HEAL_ENABLED;
    } else {
      process.env.PURCHASE_ORDER_HEAL_ENABLED = originalHealEnabled;
    }
    if (originalHealMax === undefined) {
      delete process.env.PURCHASE_ORDER_HEAL_MAX_PER_RUN;
    } else {
      process.env.PURCHASE_ORDER_HEAL_MAX_PER_RUN = originalHealMax;
    }
    resetEnvCache();
  });

  it("returns zeros when heal is disabled", async () => {
    process.env.PURCHASE_ORDER_HEAL_ENABLED = "false";
    resetEnvCache();

    const result = await runScheduledPurchaseOrderHeal();
    assert.deepEqual(result, {
      candidates: 0,
      healed: 0,
      batchReconciled: 0,
      deletedFailedInvestments: 0,
    });
  });
});

describe("processActivePurchaseOrdersForWallet", () => {
  const originalProcessorFlag = process.env.PURCHASE_ORDER_PROCESSOR_ENABLED;

  after(() => {
    if (originalProcessorFlag === undefined) {
      delete process.env.PURCHASE_ORDER_PROCESSOR_ENABLED;
    } else {
      process.env.PURCHASE_ORDER_PROCESSOR_ENABLED = originalProcessorFlag;
    }
    resetEnvCache();
  });

  it("returns zero when processor is disabled", async () => {
    process.env.PURCHASE_ORDER_PROCESSOR_ENABLED = "false";
    resetEnvCache();

    const processed = await processActivePurchaseOrdersForWallet(
      "000000000000000000000001",
      "000000000000000000000002"
    );
    assert.equal(processed, 0);
  });
});

describe("stalePurchaseOrderCandidateWhere", () => {
  it("includes processing, failed, non-final payment chain, and falsely finalized failed", () => {
    const where = stalePurchaseOrderCandidateWhere();
    assert.ok(where.OR);
    const orClauses = where.OR as object[];
    assert.equal(orClauses.length, 3);

    const statusClause = orClauses[0] as {
      status?: { in?: PurchaseOrderStatus[] };
    };
    assert.deepEqual(statusClause.status?.in, [
      PurchaseOrderStatus.processing,
      PurchaseOrderStatus.failed,
    ]);

    const finalClause = orClauses[1] as { paymentChainFinal?: boolean };
    assert.equal(finalClause.paymentChainFinal, false);

    const falseFinalClause = orClauses[2] as {
      status?: PurchaseOrderStatus;
      paymentChainFinal?: boolean;
      paymentChainOutcome?: string;
      usdtTxId?: { not: null };
    };
    assert.equal(falseFinalClause.status, PurchaseOrderStatus.failed);
    assert.equal(falseFinalClause.paymentChainFinal, true);
    assert.equal(falseFinalClause.paymentChainOutcome, "failed");
    assert.ok(falseFinalClause.usdtTxId);
  });
});
