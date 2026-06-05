import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { surplusPerSubscription } from "./accounting";
import {
  applyCsvLedgerEvent,
  assertLedgerMatchesCsvRow,
  loadAggressiveAlphaSimulationCsv,
  replaySimulationCsv,
} from "./simulateLedgerFromCsv";

describe("Aggressive Alpha CSV ledger parity", () => {
  const rows = loadAggressiveAlphaSimulationCsv();

  it("surplusPerSubscription matches CSV slice 3.33", () => {
    assert.equal(surplusPerSubscription(35), 3.33);
  });

  it("after 3 subscriptions matches CSV step 3", () => {
    let state = { poolAvailable: 0, treasurySurplus: 0 };
    for (const row of rows.slice(0, 3)) {
      state = applyCsvLedgerEvent(state, row);
      assertLedgerMatchesCsvRow(state, row);
    }
    assert.equal(state.poolAvailable, 75);
    assert.equal(state.treasurySurplus, 9.99);
  });

  it("replays first 20 CSV steps against in-memory ledger", () => {
    const head = rows.slice(0, 20);
    const snapshots = replaySimulationCsv(head);
    assert.equal(snapshots.length, head.length);
    for (let i = 0; i < head.length; i++) {
      assertLedgerMatchesCsvRow(snapshots[i]!, head[i]!);
    }
  });

  it("replays full 100-step CSV to closed cohort totals", () => {
    const snapshots = replaySimulationCsv(rows);
    const final = snapshots[snapshots.length - 1]!;
    const lastRow = rows[rows.length - 1]!;
    assertLedgerMatchesCsvRow(final, lastRow);
    assert.equal(final.poolAvailable, 785);
    assert.equal(final.treasurySurplus, 18);
  });
});
