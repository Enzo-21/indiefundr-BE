import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INVESTMENT_AMOUNT_USDT } from "@/lib/config/revenueEngine";
import {
  ledgerProtectedWithdrawable,
  ledgerTruncateUsdt,
} from "@/lib/money/formatUsdt";

export { ledgerProtectedWithdrawable };
import { surplusPerSubscription } from "./accounting";

export type CsvLedgerRow = {
  step: number;
  event: string;
  fund: string;
  returnPercent: number;
  label: string;
  amountUsdt: number;
  poolAvailable: number;
  treasurySurplus: number;
  protectedWithdrawable: number;
};

export type SimulatedLedgerState = {
  poolAvailable: number;
  treasurySurplus: number;
};

const AGGRESSIVE_PAYOUT_USDT = 35;

export function parseSimulationCsv(content: string): CsvLedgerRow[] {
  const lines = content.trim().split("\n");
  const rows: CsvLedgerRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 9) continue;
    rows.push({
      step: Number(parts[0]),
      event: parts[1] ?? "",
      fund: parts[2] ?? "",
      returnPercent: Number(parts[3]),
      label: parts[4] ?? "",
      amountUsdt: Number(parts[5]),
      poolAvailable: Number(parts[6]),
      treasurySurplus: Number(parts[7]),
      protectedWithdrawable: Number(parts[8]),
    });
  }
  return rows;
}

export function loadAggressiveAlphaSimulationCsv(): CsvLedgerRow[] {
  const path = join(
    process.cwd(),
    "specs/revenue-engine/simulations/aggressive-alpha-100-investments-simulation.csv"
  );
  return parseSimulationCsv(readFileSync(path, "utf8"));
}

export function applyCsvLedgerEvent(
  state: SimulatedLedgerState,
  row: Pick<CsvLedgerRow, "event" | "amountUsdt">
): SimulatedLedgerState {
  const principal = INVESTMENT_AMOUNT_USDT();
  const payoutAmount = ledgerTruncateUsdt(row.amountUsdt);

  switch (row.event) {
    case "subscription": {
      const surplusSlice = surplusPerSubscription(AGGRESSIVE_PAYOUT_USDT, principal);
      return {
        poolAvailable: ledgerTruncateUsdt(state.poolAvailable + principal),
        treasurySurplus: ledgerTruncateUsdt(
          state.treasurySurplus + surplusSlice
        ),
      };
    }
    case "payout":
      return {
        poolAvailable: ledgerTruncateUsdt(
          Math.max(0, state.poolAvailable - payoutAmount)
        ),
        treasurySurplus: state.treasurySurplus,
      };
    case "surplus_payout":
      return {
        poolAvailable: ledgerTruncateUsdt(
          Math.max(0, state.poolAvailable - payoutAmount)
        ),
        treasurySurplus: ledgerTruncateUsdt(
          Math.max(0, state.treasurySurplus - payoutAmount)
        ),
      };
    default:
      return state;
  }
}

export function replaySimulationCsv(
  rows: CsvLedgerRow[]
): SimulatedLedgerState[] {
  const snapshots: SimulatedLedgerState[] = [];
  let state: SimulatedLedgerState = { poolAvailable: 0, treasurySurplus: 0 };

  for (const row of rows) {
    state = applyCsvLedgerEvent(state, row);
    snapshots.push({ ...state });
  }

  return snapshots;
}

/** Replay CSV in order until `targetSubscriptions` subscription events have been applied. */
export function expectedLedgerAfterSubscriptionEvents(
  rows: CsvLedgerRow[],
  targetSubscriptions: number
): SimulatedLedgerState {
  if (targetSubscriptions <= 0) {
    return { poolAvailable: 0, treasurySurplus: 0 };
  }

  let state: SimulatedLedgerState = { poolAvailable: 0, treasurySurplus: 0 };
  let subscriptions = 0;

  for (const row of rows) {
    state = applyCsvLedgerEvent(state, row);
    if (row.event === "subscription") {
      subscriptions += 1;
      if (subscriptions >= targetSubscriptions) {
        break;
      }
    }
  }

  return state;
}

export function assertLedgerMatchesCsvRow(
  state: SimulatedLedgerState,
  row: CsvLedgerRow,
  tolerance = 0.011
): void {
  const protectedCalc = ledgerProtectedWithdrawable(
    state.poolAvailable,
    state.treasurySurplus
  );
  const poolOk =
    Math.abs(state.poolAvailable - row.poolAvailable) <= tolerance;
  const surplusOk =
    Math.abs(state.treasurySurplus - row.treasurySurplus) <= tolerance;
  const protectedOk =
    Math.abs(protectedCalc - row.protectedWithdrawable) <= tolerance;

  if (!poolOk || !surplusOk || !protectedOk) {
    throw new Error(
      `step ${row.step} ${row.event}: expected pool=${row.poolAvailable} surplus=${row.treasurySurplus} protected=${row.protectedWithdrawable}, got pool=${state.poolAvailable} surplus=${state.treasurySurplus} protected=${protectedCalc}`
    );
  }
}
