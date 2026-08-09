export const PAYOUT_AUTOPILOT_STORAGE_KEY =
  "indiefundr.admin.payoutAutopilot.v1";

export type PayoutAutopilotModes = {
  includeNormal: boolean;
  includeSurplus: boolean;
};

export type PayoutAutopilotStoredState = {
  enabled: true;
  modes: PayoutAutopilotModes;
};

function isModes(value: unknown): value is PayoutAutopilotModes {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.includeNormal === "boolean" &&
    typeof v.includeSurplus === "boolean"
  );
}

export function readPayoutAutopilotStorage(): PayoutAutopilotStoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PAYOUT_AUTOPILOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PayoutAutopilotStoredState>;
    if (parsed?.enabled !== true || !isModes(parsed.modes)) {
      return null;
    }
    return { enabled: true, modes: parsed.modes };
  } catch {
    return null;
  }
}

export function writePayoutAutopilotStorage(modes: PayoutAutopilotModes): void {
  if (typeof window === "undefined") return;
  const payload: PayoutAutopilotStoredState = { enabled: true, modes };
  try {
    window.localStorage.setItem(
      PAYOUT_AUTOPILOT_STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch {
    // ignore quota / private mode
  }
}

export function clearPayoutAutopilotStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PAYOUT_AUTOPILOT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
