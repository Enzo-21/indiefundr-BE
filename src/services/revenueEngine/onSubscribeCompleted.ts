import type { Investment } from "@prisma/client";
import { REVENUE_ENGINE_ENABLED } from "@/lib/config/revenueEngine";
import { recordSubscribeInflow } from "./ledger";
import { evaluatePayoutReadiness } from "./payoutScheduler";

export async function onSubscribeCompleted(investment: Investment): Promise<void> {
  if (!REVENUE_ENGINE_ENABLED()) {
    return;
  }

  await recordSubscribeInflow(investment);
  await evaluatePayoutReadiness();
}
