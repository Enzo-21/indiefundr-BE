import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PurchaseOrderStatus } from "@prisma/client";
import {
  buildActivityScopeFilter,
  buildSuccessPaymentTxIdsForTest,
  finalizePaginatedActivityResult,
  pickPaginationRowFromPage,
  REFERRAL_ACTIVITY_KINDS,
  rowToVisibleTx,
} from "./loadPaginatedDbWalletActivity";
import type { WalletActivity } from "@prisma/client";
import type { WalletActivityTx } from "./walletActivityMerge";

describe("buildActivityScopeFilter", () => {
  it("returns referral kinds filter when scope is referral", () => {
    const filter = buildActivityScopeFilter("referral");
    assert.deepEqual(filter, { kind: { in: [...REFERRAL_ACTIVITY_KINDS] } });
  });

  it("returns empty filter for all or undefined scope", () => {
    assert.deepEqual(buildActivityScopeFilter("all"), {});
    assert.deepEqual(buildActivityScopeFilter(undefined), {});
  });
});

describe("loadPaginatedDbWalletActivity visibility", () => {
  const baseRow = {
    id: "row1",
    userId: "u1",
    walletId: "w1",
    kind: "redemption",
    entityId: "inv1",
    txId: "tx-failed",
    type: "in",
    amountUsdt: 10,
    status: "failed",
    label: "Earnings credited (Fund)",
    detail: null,
    occurredAt: new Date("2026-03-01T12:00:00.000Z"),
    tronscanUrl: null,
    chainFinal: true,
    pendingTapInfo: null,
    updatedAt: new Date(),
  };

  it("drops failed rows superseded by a successful payment txId", () => {
    const successPaymentTxIds = new Set(["tx-failed"]);
    const tx = rowToVisibleTx(
      baseRow,
      successPaymentTxIds,
      new Map(),
      new Map()
    );
    assert.equal(tx, null);
  });

  it("keeps failed rows when payment txId is not marked successful", () => {
    const tx = rowToVisibleTx(
      baseRow,
      new Set(),
      new Map(),
      new Map()
    );
    assert.ok(tx);
    assert.equal(tx.id, "redemption-inv1");
  });
});

describe("pickPaginationRowFromPage", () => {
  it("uses the source row for the oldest visible transaction on the page", () => {
    const newerRow = {
      id: "row-new",
      occurredAt: new Date("2026-03-02T00:00:00.000Z"),
    } as WalletActivity;
    const olderRow = {
      id: "row-old",
      occurredAt: new Date("2026-03-01T00:00:00.000Z"),
    } as WalletActivity;
    const txs = [
      { id: "tx-new", date: new Date("2026-03-02T00:00:00.000Z") },
      { id: "tx-old", date: new Date("2026-03-01T00:00:00.000Z") },
    ] as WalletActivityTx[];

    const txSourceRow = new Map([
      ["tx-new", newerRow],
      ["tx-old", olderRow],
    ]);

    const picked = pickPaginationRowFromPage(txs, txSourceRow, newerRow);
    assert.equal(picked?.id, "row-old");
  });

  it("falls back to last consumed row when tx source is missing", () => {
    const fallback = {
      id: "row-fallback",
      occurredAt: new Date("2026-03-01T00:00:00.000Z"),
    } as WalletActivity;
    const txs = [
      { id: "tx-1", date: new Date("2026-03-01T00:00:00.000Z") },
    ] as WalletActivityTx[];

    const picked = pickPaginationRowFromPage(txs, new Map(), fallback);
    assert.equal(picked?.id, "row-fallback");
  });
});

describe("finalizePaginatedActivityResult", () => {
  const lastRow = {
    id: "row-z",
    occurredAt: new Date("2026-03-01T12:00:00.000Z"),
  } as WalletActivity;

  it("returns hasMore false when no visible transactions", () => {
    const result = finalizePaginatedActivityResult([], true, lastRow);
    assert.equal(result.hasMore, false);
    assert.equal(result.nextCursor, null);
    assert.equal(result.transactions.length, 0);
  });

  it("keeps cursor when transactions exist and hasMore is true", () => {
    const txs = [
      {
        id: "tx-1",
        date: "2026-03-02T00:00:00.000Z",
      },
    ] as ReturnType<typeof finalizePaginatedActivityResult>["transactions"];
    const result = finalizePaginatedActivityResult(txs, true, lastRow);
    assert.equal(result.hasMore, true);
    assert.ok(result.nextCursor);
  });
});

describe("buildSuccessPaymentTxIds (pagination helper)", () => {
  it("collects tx ids from successful payment outcomes", () => {
    const ids = buildSuccessPaymentTxIdsForTest([
      {
        usdtTxId: "tx-a",
        failedUsdtTxIds: [],
        paymentChainOutcome: "success",
        status: PurchaseOrderStatus.processing,
      },
      {
        usdtTxId: "tx-b",
        failedUsdtTxIds: [],
        paymentChainOutcome: null,
        status: PurchaseOrderStatus.completed,
      },
    ]);
    assert.ok(ids.has("tx-a"));
    assert.ok(ids.has("tx-b"));
  });
});
