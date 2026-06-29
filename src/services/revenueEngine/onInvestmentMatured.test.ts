import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REVENUE_ENGINE_ENABLED } from "@/lib/config/revenueEngine";

describe("onInvestmentMatured", () => {
  it("is a no-op when revenue engine is disabled", async () => {
    if (REVENUE_ENGINE_ENABLED()) {
      return;
    }

    const { onInvestmentMatured } = await import("./onInvestmentMatured");
    await assert.doesNotReject(async () => {
      await onInvestmentMatured(["000000000000000000000001"]);
    });
  });

  it("runs evaluateAll when revenue engine is enabled", async () => {
    if (!REVENUE_ENGINE_ENABLED()) {
      return;
    }

    const { onInvestmentMatured } = await import("./onInvestmentMatured");
    const { getLastEvaluation } = await import("./evaluateAll");
    const before = getLastEvaluation().evaluatedAt;

    await onInvestmentMatured();

    const after = getLastEvaluation().evaluatedAt;
    assert.ok(after != null);
    if (before != null) {
      assert.ok(after.getTime() >= before.getTime());
    }
  });
});
