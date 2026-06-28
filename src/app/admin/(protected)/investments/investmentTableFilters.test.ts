import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  AdminInvestmentDisplayRow,
  AdminInvestmentsListResult,
} from "@/services/admin/investmentAdminTypes";
import {
  fetchInvestmentsForFilters,
  getInvestmentTableEmptyMessage,
  mergeInvestmentListSnapshots,
  resolveFetchMode,
} from "./investmentTableFilters";

function displayRow(
  id: string,
  step: number,
  sortAtIso: string,
  overrides: Partial<AdminInvestmentDisplayRow> = {}
): AdminInvestmentDisplayRow {
  return {
    rowKey: `${id}:subscription`,
    investmentId: id,
    displayKind: "subscription",
    chronologicalStep: step,
    sortAtIso,
    eventKind: "subscription",
    ledger: null,
    ledgerSurplusDelta: null,
    ledgerPending: false,
    ledgerContingent: false,
    amountUsdt: 25,
    subscribedAtIso: sortAtIso,
    subscribedColumnHint: null,
    userEmail: "user@example.com",
    userName: "User",
    fundName: "Fund",
    returnPercent90d: 40,
    investment: null,
    parentInvestment: null,
    ...overrides,
  };
}

function snapshot(
  displayRows: AdminInvestmentDisplayRow[],
  view: "queue" | "archive" | "all" = "queue"
): AdminInvestmentsListResult {
  return {
    rows: [],
    displayRows,
    currentLedger: {
      poolAvailable: 10,
      treasurySurplus: 5,
      poolLiquidity: 8,
      protectedRevenueAvailable: 1,
    },
    payoutAvailability: {
      unlockedPayoutCount: 1,
      surplusPayoutCount: 0,
    },
    pageInfo: {
      hasMore: false,
      nextCursor: null,
      view,
      limit: 100,
    },
  };
}

describe("investmentTableFilters", () => {
  it("resolveFetchMode maps checkbox combinations", () => {
    assert.equal(
      resolveFetchMode({ showQueue: true, showArchive: false }),
      "queue"
    );
    assert.equal(
      resolveFetchMode({ showQueue: false, showArchive: true }),
      "archive"
    );
    assert.equal(
      resolveFetchMode({ showQueue: true, showArchive: true }),
      "both"
    );
    assert.equal(
      resolveFetchMode({ showQueue: false, showArchive: false }),
      "none"
    );
  });

  it("both mode fetches view=all once instead of merging streams", async () => {
    const calls: Array<{ view?: string; cursor?: string }> = [];
    const allSnapshot = snapshot(
      [displayRow("inv-1", 1, "2026-01-01T00:00:00.000Z")],
      "all"
    );
    allSnapshot.pageInfo.hasMore = true;
    allSnapshot.pageInfo.nextCursor = "all-cursor";

    const result = await fetchInvestmentsForFilters(
      async (options) => {
        calls.push(options);
        return { ok: true, data: allSnapshot };
      },
      { showQueue: true, showArchive: true },
      { limit: 50, queueCursor: "page-2" }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.view, "all");
    assert.equal(calls[0]?.cursor, "page-2");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.mode, "both");
    assert.equal(result.data.pageInfo.view, "all");
    assert.equal(result.cursors.queueCursor, "all-cursor");
    assert.equal(result.cursors.queueHasMore, true);
    assert.equal(result.streams.queue, null);
    assert.equal(result.streams.archive, null);
  });

  it("mergeInvestmentListSnapshots refreshes stale payout sort before reorder", () => {
    const parentInvestment = {
      id: "inv-1",
      payoutUnlockingInvestmentIds: ["inv-2", "inv-4"],
    } as AdminInvestmentDisplayRow["parentInvestment"];

    const queue = snapshot([
      displayRow("inv-2", 1, "2026-01-02T00:00:00.000Z"),
      displayRow("inv-4", 2, "2026-01-04T00:00:00.000Z"),
    ]);
    const archive = snapshot(
      [
        displayRow("inv-1", 1, "2026-01-01T00:00:00.000Z"),
        displayRow("inv-1", 2, "2026-01-02T00:00:00.000Z", {
          rowKey: "inv-1:payout",
          displayKind: "payout",
          eventKind: "payout",
          sortAtIso: "2026-01-02T00:00:00.000Z",
          subscribedAtIso: "2026-01-02T00:00:00.000Z",
          subscribedColumnHint: "#1 unlocked after #2",
          parentInvestment,
          investment: null,
        }),
      ],
      "archive"
    );

    const merged = mergeInvestmentListSnapshots(queue, archive, 100);

    assert.deepEqual(
      merged.displayRows.map(
        (r) => `${r.chronologicalStep}:${r.displayKind}:${r.investmentId}`
      ),
      [
        "1:subscription:inv-1",
        "2:subscription:inv-2",
        "3:subscription:inv-4",
        "4:payout:inv-1",
      ]
    );
    assert.equal(
      merged.displayRows[3]?.subscribedColumnHint,
      "#1 unlocked after #2, #3"
    );
  });

  it("getInvestmentTableEmptyMessage covers none-selected state", () => {
    assert.match(getInvestmentTableEmptyMessage("none"), /Select Action queue/i);
    assert.match(
      getInvestmentTableEmptyMessage("archive"),
      /No paid or archived investments/i
    );
  });
});
