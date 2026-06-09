import { processPendingPurchaseOrders } from "@/services/orders/purchaseOrderProcessor";
import { markMaturedInvestments } from "@/services/investments/maturity";
import { processRedemptionConfirmations } from "@/services/investments/redemptions";
import { evaluateAll } from "@/services/revenueEngine/evaluateAll";

export type InvestmentPipelineStage =
  | "purchaseOrders"
  | "maturity"
  | "evaluate"
  | "redemptions";

export type InvestmentPipelineResult = {
  startedAt: string;
  finishedAt: string;
  stages: Partial<
    Record<
      InvestmentPipelineStage,
      { ok: true; result: unknown } | { ok: false; error: string }
    >
  >;
};

async function runStage<T>(
  stages: InvestmentPipelineResult["stages"],
  name: InvestmentPipelineStage,
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    const result = await fn();
    stages[name] = { ok: true, result };
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stages[name] = { ok: false, error: message };
    console.error(`[investmentPipeline] ${name} failed`, error);
    return null;
  }
}

export async function runInvestmentPipeline(): Promise<InvestmentPipelineResult> {
  const startedAt = new Date().toISOString();
  const stages: InvestmentPipelineResult["stages"] = {};

  await runStage(stages, "purchaseOrders", () =>
    processPendingPurchaseOrders({ limit: 50 })
  );
  await runStage(stages, "maturity", () => markMaturedInvestments());
  await runStage(stages, "evaluate", () => evaluateAll());
  await runStage(stages, "redemptions", () =>
    processRedemptionConfirmations()
  );

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    stages,
  };
}
