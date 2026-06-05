import { REVENUE_ENGINE_ENABLED } from "@/lib/config/revenueEngine";

/** Status-only transition; payability refresh runs on subscribe or investments page load. */
export async function onInvestmentMatured(): Promise<void> {
  if (!REVENUE_ENGINE_ENABLED()) {
    return;
  }
}
