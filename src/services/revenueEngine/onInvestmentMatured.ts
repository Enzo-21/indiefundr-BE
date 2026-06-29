import { REVENUE_ENGINE_ENABLED } from "@/lib/config/revenueEngine";
import { ensureUnpaidMaturityChoiceDeadline } from "@/services/investments/unpaidMaturityChoice";
import { evaluateAll } from "./evaluateAll";

export async function onInvestmentMatured(
  newlyMaturedIds: string[] = []
): Promise<void> {
  if (!REVENUE_ENGINE_ENABLED()) {
    return;
  }

  for (const investmentId of newlyMaturedIds) {
    await ensureUnpaidMaturityChoiceDeadline(investmentId);
  }

  await evaluateAll();
}
