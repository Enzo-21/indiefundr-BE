export const ORDER_AUTOPILOT_STORAGE_KEY = "indiefundr.admin.orderAutopilot.v1";

export type OrderAutopilotModes = {
  includeInvestment: boolean;
  includeWithdrawal: boolean;
  includeReferral: boolean;
  includeUsdtPurchase: boolean;
};

export type OrderAutopilotStoredState = {
  enabled: true;
  modes: OrderAutopilotModes;
};

function isModes(value: unknown): value is OrderAutopilotModes {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.includeInvestment === "boolean" &&
    typeof v.includeWithdrawal === "boolean" &&
    typeof v.includeReferral === "boolean" &&
    typeof v.includeUsdtPurchase === "boolean"
  );
}

export function readOrderAutopilotStorage(): OrderAutopilotStoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ORDER_AUTOPILOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OrderAutopilotStoredState>;
    if (parsed?.enabled !== true || !isModes(parsed.modes)) {
      return null;
    }
    return { enabled: true, modes: parsed.modes };
  } catch {
    return null;
  }
}

export function writeOrderAutopilotStorage(modes: OrderAutopilotModes): void {
  if (typeof window === "undefined") return;
  const payload: OrderAutopilotStoredState = { enabled: true, modes };
  try {
    window.localStorage.setItem(
      ORDER_AUTOPILOT_STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch {
    // ignore quota / private mode
  }
}

export function clearOrderAutopilotStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ORDER_AUTOPILOT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
