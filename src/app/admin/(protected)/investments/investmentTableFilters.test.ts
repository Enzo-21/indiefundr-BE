import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AdminInvestmentsListResult } from "@/services/admin/investmentAdminTypes";
import {
  getInvestmentTableEmptyMessage,
  mergeInvestmentListSnapshots,
  resolveFetchMode,
} from "./investmentTableFilters";

function snapshot(
  id: string,
  step: number,
  view: "queue" | "archive" = "queue"
): AdminInvestmentsListResult {
  return {
    rows: [],
    displayRows: [
      {
        rowKey: `${view}-${id}`,
        investmentId: id,
        displayKind: "subscription",
        chronologicalStep: step,
        sortAtIso: "2024-01-01T00:00:00.000Z",
        eventKind: "subscription",
        ledger: null,
        ledgerSurplusDelta: null,
        ledgerPending: false,
        ledgerContingent: false,
        amountUsdt: 25,
        subscribedAtIso: "2024-01-01T00:00:00.000Z",
        subscribedColumnHint: null,
        userEmail: "user@example.com",
        userName: "User",
        fundName: "Fund",
        returnPercent90d: 40,
        investment: null,
        parentInvestment: null,
      },
    ],
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

  it("mergeInvestmentListSnapshots keeps queue before archive and renumbers steps", () => {
    const queue = snapshot("queue-1", 1, "queue");
    const archive = snapshot("archive-1", 1, "archive");
    archive.pageInfo.hasMore = true;
    archive.pageInfo.nextCursor = "archive-cursor";

    const merged = mergeInvestmentListSnapshots(queue, archive, 100);

    assert.equal(merged.displayRows.length, 2);
    assert.equal(merged.displayRows[0]?.investmentId, "queue-1");
    assert.equal(merged.displayRows[0]?.chronologicalStep, 1);
    assert.equal(merged.displayRows[1]?.investmentId, "archive-1");
    assert.equal(merged.displayRows[1]?.chronologicalStep, 2);
    assert.equal(merged.pageInfo.hasMore, true);
    assert.equal(merged.pageInfo.view, "all");
  });

  it("getInvestmentTableEmptyMessage covers none-selected state", () => {
    assert.match(getInvestmentTableEmptyMessage("none"), /Select Action queue/i);
    assert.match(
      getInvestmentTableEmptyMessage("archive"),
      /No paid or archived investments/i
    );
  });
});
