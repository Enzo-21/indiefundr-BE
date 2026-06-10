import assert from "node:assert/strict";
import { InvestmentStatus } from "@prisma/client";
import { describe, it } from "node:test";
import {
  buildInvestmentLedgerTimeline,
  computePayoutSortAt,
  computeSurplusPayoutSortAt,
} from "./investmentLedgerTimeline";
import type { AdminInvestmentRow } from "./investmentAdminTypes";
import { buildInvestmentLedgerViewsFromEvents } from "./investmentLedgerSnapshots";
import { surplusPerSubscription } from "@/services/revenueEngine/accounting";

function baseRow(
  overrides: Partial<AdminInvestmentRow> & { id: string }
): AdminInvestmentRow {
  const subscribedAt = overrides.subscribedAt ?? new Date("2026-01-01");
  return {
    id: overrides.id,
    subscribedAtIso: subscribedAt.toISOString(),
    returnPercent90d: 15,
    ledgerAfterSubscribe: {
      pool: 25,
      surplus: 5,
      protectedWithdrawable: 20,
    },
    ledgerAfterPayout: null,
    ledgerEventKind: "subscription",
    payoutUnlockingInvestmentIds: [],
    userId: `user-${overrides.id}`,
    userEmail: `${overrides.id}@test.com`,
    userName: null,
    fundId: "balanced-growth",
    fundName: "Hustle Collective",
    amountUsdt: 25,
    projectedPayoutUsdt: 28.75,
    status: InvestmentStatus.active,
    payabilityStatus: "pending_liquidity",
    subscribedAt,
    maturesAt: null,
    payoutEligibleAt: null,
    payoutUnlockedAt: null,
    payoutReason: null,
    payoutTriggeredBy: null,
    payoutFailureReason: null,
    payoutStatus: "waiting",
    surplusPayoutAvailableAt: null,
    surplusShortfallUsdt: 0,
    surplusPayoutReason: "not_available",
    canPayWithSurplus: false,
    payoutUnlockers: [],
    redeemedAt: null,
    termDaysLeft: null,
    payoutEligibleInDays: null,
    canClaim: false,
    canPayNow: false,
    showPayoutActions: false,
    payNowBlockReason: "Waiting",
    surplusBlockReason: null,
    canConfirmRedemption: false,
    confirmRedemptionBlockReason: null,
    redemptionTxId: null,
    ...overrides,
  };
}

describe("buildInvestmentLedgerTimeline", () => {
  it("places payout row after second unlocker subscription", () => {
    const rows: AdminInvestmentRow[] = [
      baseRow({
        id: "inv-1",
        subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-01-10"),
        payoutUnlockingInvestmentIds: ["inv-2", "inv-3"],
        ledgerAfterPayout: {
          pool: 46.25,
          surplus: 16.26,
          protectedWithdrawable: 29.99,
        },
        ledgerEventKind: "payout",
        payoutTriggeredBy: "admin",
        status: InvestmentStatus.redeemed,
        payoutStatus: "paid",
      }),
      baseRow({
        id: "inv-2",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
      baseRow({
        id: "inv-3",
        subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
      }),
      baseRow({
        id: "inv-4",
        subscribedAt: new Date("2026-01-04T00:00:00.000Z"),
      }),
    ];

    const display = buildInvestmentLedgerTimeline(rows);
    const kinds = display.map(
      (r) => `${r.chronologicalStep}:${r.displayKind}:${r.investmentId}`
    );

    assert.deepEqual(kinds, [
      "1:subscription:inv-1",
      "2:subscription:inv-2",
      "3:subscription:inv-3",
      "4:payout:inv-1",
      "5:subscription:inv-4",
    ]);
    assert.equal(display[3]?.eventKind, "payout");
    assert.equal(display[3]?.subscribedColumnHint, "#1 unlocked after #2, #3");
    assert.equal(display[3]?.parentInvestment?.id, "inv-1");
    assert.equal(display[3]?.parentInvestment?.payoutStatus, "paid");
    assert.equal(display[3]?.investment, null);
    assert.equal(
      display[0]?.ledgerSurplusDelta,
      surplusPerSubscription(28.75)
    );
    assert.equal(display[3]?.ledger?.surplus, 16.26);
    assert.equal(display[3]?.ledgerSurplusDelta, 0);
    assert.equal(display[3]?.ledgerPending, false);
    assert.equal(display[4]?.ledgerContingent, false);
  });

  it("triad unlocked but unpaid payout row has no ledger snapshots", () => {
    const rows: AdminInvestmentRow[] = [
      baseRow({
        id: "inv-1",
        subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-01-10"),
        payoutUnlockingInvestmentIds: ["inv-2", "inv-3"],
        payoutStatus: "ready",
      }),
      baseRow({
        id: "inv-2",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
      baseRow({
        id: "inv-3",
        subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
      }),
    ];

    const display = buildInvestmentLedgerTimeline(rows);
    const payoutRow = display.find(
      (r) => r.displayKind === "payout" && r.investmentId === "inv-1"
    );
    assert.ok(payoutRow);
    assert.equal(payoutRow.eventKind, "payout");
    assert.equal(payoutRow.ledger, null);
    assert.equal(payoutRow.ledgerSurplusDelta, null);
    assert.equal(payoutRow.ledgerPending, true);
    assert.equal(payoutRow.ledgerContingent, false);
  });

  it("subscription after unpaid payout is ledgerContingent", () => {
    const rows: AdminInvestmentRow[] = [
      baseRow({
        id: "inv-1",
        subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-01-10"),
        payoutUnlockingInvestmentIds: ["inv-2", "inv-3"],
        payoutStatus: "ready",
      }),
      baseRow({
        id: "inv-2",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
      baseRow({
        id: "inv-3",
        subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
      }),
      baseRow({
        id: "inv-4",
        subscribedAt: new Date("2026-01-04T00:00:00.000Z"),
        ledgerAfterSubscribe: {
          pool: 100,
          surplus: 13.32,
          protectedWithdrawable: 86.68,
        },
      }),
    ];

    const display = buildInvestmentLedgerTimeline(rows);
    const subAfter = display.find(
      (r) => r.displayKind === "subscription" && r.investmentId === "inv-4"
    );
    assert.ok(subAfter?.ledger);
    assert.equal(subAfter.ledgerContingent, true);
    assert.equal(subAfter.ledgerPending, false);
  });

  it("emits pending surplus_payout row when eligible for surplus pay", () => {
    const maturesAt = new Date("2026-04-01");
    const rows: AdminInvestmentRow[] = [
      baseRow({
        id: "inv-a",
        subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
        canPayWithSurplus: true,
        projectedPayoutUsdt: 28,
        maturesAt,
        surplusPayoutAvailableAt: new Date("2026-03-25"),
      }),
    ];

    const display = buildInvestmentLedgerTimeline(rows);
    const payoutRow = display.find(
      (r) =>
        r.displayKind === "payout" &&
        r.investmentId === "inv-a" &&
        r.eventKind === "surplus_payout"
    );
    assert.ok(payoutRow);
    assert.equal(payoutRow.ledgerPending, true);
    assert.equal(payoutRow.ledger, null);
  });

  it("emits one pending surplus_payout row while redeeming", () => {
    const rows: AdminInvestmentRow[] = [
      baseRow({
        id: "inv-pending",
        subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
        status: InvestmentStatus.redeeming,
        payoutTriggeredBy: "admin_surplus_liquidity",
        payoutStatus: "paying_surplus",
        canPayWithSurplus: false,
        canConfirmRedemption: true,
        redemptionTxId: "tx-surplus-1",
      }),
    ];

    const display = buildInvestmentLedgerTimeline(rows);
    const surplusPayoutRows = display.filter(
      (r) =>
        r.displayKind === "payout" &&
        r.investmentId === "inv-pending" &&
        r.eventKind === "surplus_payout"
    );
    assert.equal(surplusPayoutRows.length, 1);
    assert.equal(surplusPayoutRows[0].ledgerPending, true);
    assert.equal(
      surplusPayoutRows[0].parentInvestment?.status,
      InvestmentStatus.redeeming
    );
  });

  it("does not emit surplus_payout row when not surplus-eligible", () => {
    const rows: AdminInvestmentRow[] = [
      baseRow({
        id: "inv-a",
        subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
        canPayWithSurplus: false,
        projectedPayoutUsdt: 28,
        maturesAt: new Date("2026-04-01"),
      }),
      baseRow({
        id: "inv-b",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
        canPayWithSurplus: false,
        projectedPayoutUsdt: 27,
        maturesAt: new Date("2026-04-02"),
      }),
    ];

    const display = buildInvestmentLedgerTimeline(rows);
    const surplusPayoutRows = display.filter(
      (r) => r.displayKind === "payout" && r.eventKind === "surplus_payout"
    );
    assert.equal(surplusPayoutRows.length, 0);
  });

  it("emits surplus_payout row only for fifo-eligible subscription", () => {
    const rows: AdminInvestmentRow[] = [
      baseRow({
        id: "inv-a",
        subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
        canPayWithSurplus: true,
        projectedPayoutUsdt: 31,
        maturesAt: new Date("2026-04-01"),
      }),
      baseRow({
        id: "inv-b",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
        canPayWithSurplus: false,
        surplusPayoutReason: "fifo_surplus_blocked",
        projectedPayoutUsdt: 35,
        maturesAt: new Date("2026-04-02"),
      }),
    ];

    const display = buildInvestmentLedgerTimeline(rows);
    const surplusPayoutRows = display.filter(
      (r) => r.displayKind === "payout" && r.eventKind === "surplus_payout"
    );
    assert.equal(surplusPayoutRows.length, 1);
    assert.equal(surplusPayoutRows[0]?.investmentId, "inv-a");
  });

  it("completed surplus payout row uses after-payout ledger", () => {
    const rows: AdminInvestmentRow[] = [
      baseRow({
        id: "inv-5",
        subscribedAt: new Date("2026-01-05T00:00:00.000Z"),
        status: InvestmentStatus.redeemed,
        payoutStatus: "paid_surplus",
        payoutTriggeredBy: "admin_surplus_liquidity",
        redeemedAt: new Date("2026-03-30"),
        ledgerAfterPayout: {
          pool: 100,
          surplus: 1.63,
          protectedWithdrawable: 98.37,
        },
      }),
    ];

    const display = buildInvestmentLedgerTimeline(rows);
    const payoutRow = display.find(
      (r) => r.displayKind === "payout" && r.investmentId === "inv-5"
    );
    assert.ok(payoutRow);
    assert.equal(payoutRow.eventKind, "surplus_payout");
    assert.equal(payoutRow.ledger?.pool, 100);
    assert.equal(payoutRow.ledger?.surplus, 1.63);
    assert.equal(payoutRow.ledgerSurplusDelta, -28.75);
  });

  it("computeSurplusPayoutSortAt prefers surplus window before maturity", () => {
    const row = baseRow({
      id: "inv-5",
      maturesAt: new Date("2026-04-01"),
      surplusPayoutAvailableAt: new Date("2026-03-25"),
    });
    const sortAt = computeSurplusPayoutSortAt(row, undefined);
    assert.equal(sortAt.toISOString(), new Date("2026-03-25").toISOString());
  });

  it("computes subscribe surplus delta from treasury credit per investment", () => {
    const rows: AdminInvestmentRow[] = [
      baseRow({
        id: "inv-a",
        subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
        projectedPayoutUsdt: 35,
        ledgerAfterSubscribe: {
          pool: 25,
          surplus: 3.33,
          protectedWithdrawable: 21.67,
        },
      }),
      baseRow({
        id: "inv-b",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
        projectedPayoutUsdt: 35,
        ledgerAfterSubscribe: {
          pool: 50,
          surplus: 6.66,
          protectedWithdrawable: 43.34,
        },
      }),
    ];

    const ledgerViews = buildInvestmentLedgerViewsFromEvents(
      rows.map((r) => ({
        id: r.id,
        payoutTriggeredBy: r.payoutTriggeredBy,
        projectedPayoutUsdt: r.projectedPayoutUsdt,
      })),
      []
    );
    for (const row of rows) {
      const view = ledgerViews.get(row.id);
      if (view) {
        view.subscribeSurplusCredit = 3.33;
      }
    }

    const display = buildInvestmentLedgerTimeline(rows, ledgerViews);
    assert.equal(display[0]?.ledgerSurplusDelta, 3.33);
    assert.equal(display[1]?.ledgerSurplusDelta, 3.33);
  });

  it("triad payout sorted after later unlockers shows zero surplus delta", () => {
    const headSubscribe = new Date("2026-06-02T18:00:00.000Z");
    const unlockerSubscribe = new Date("2026-06-02T20:00:00.000Z");
    const rows: AdminInvestmentRow[] = [
      baseRow({
        id: "head",
        subscribedAt: headSubscribe,
        projectedPayoutUsdt: 35,
        payoutUnlockingInvestmentIds: ["unlock-a", "unlock-b"],
        payoutUnlockedAt: unlockerSubscribe,
        redeemedAt: new Date("2026-06-02T19:00:00.000Z"),
        ledgerAfterSubscribe: {
          pool: 65,
          surplus: 19.54,
          protectedWithdrawable: 45.46,
        },
        ledgerAfterPayout: {
          pool: 106.25,
          surplus: 19.54,
          protectedWithdrawable: 86.71,
        },
        ledgerEventKind: "payout",
        payoutTriggeredBy: "admin",
        status: InvestmentStatus.redeemed,
        payoutStatus: "paid",
      }),
      baseRow({
        id: "unlock-a",
        subscribedAt: unlockerSubscribe,
        projectedPayoutUsdt: 31.25,
        ledgerAfterSubscribe: {
          pool: 91.25,
          surplus: 3.72,
          protectedWithdrawable: 87.53,
        },
      }),
      baseRow({
        id: "unlock-b",
        subscribedAt: unlockerSubscribe,
        projectedPayoutUsdt: 31.25,
        ledgerAfterSubscribe: {
          pool: 91.25,
          surplus: 8.3,
          protectedWithdrawable: 82.95,
        },
      }),
    ];

    const ledgerViews = buildInvestmentLedgerViewsFromEvents(
      rows.map((r) => ({
        id: r.id,
        payoutTriggeredBy: r.payoutTriggeredBy,
        projectedPayoutUsdt: r.projectedPayoutUsdt,
      })),
      []
    );
    ledgerViews.get("head")!.subscribeSurplusCredit = 3.33;
    ledgerViews.get("head")!.payoutSurplusDraw = 0;
    ledgerViews.get("unlock-a")!.subscribeSurplusCredit = 3.33;
    ledgerViews.get("unlock-b")!.subscribeSurplusCredit = 4.58;

    const display = buildInvestmentLedgerTimeline(rows, ledgerViews);
    const payoutRow = display.find(
      (r) => r.displayKind === "payout" && r.investmentId === "head"
    );
    const unlockBSub = display.find(
      (r) => r.displayKind === "subscription" && r.investmentId === "unlock-b"
    );

    assert.ok(payoutRow);
    assert.equal(payoutRow.ledgerSurplusDelta, 0);
    assert.equal(unlockBSub?.ledgerSurplusDelta, 4.58);
  });

  it("computePayoutSortAt uses latest unlocker subscribedAt", () => {
    const row = baseRow({
      id: "head",
      payoutUnlockingInvestmentIds: ["a", "b"],
      payoutUnlockedAt: new Date("2026-06-01"),
    });
    const subscribedAtByInvestmentId = new Map([
      ["a", new Date("2026-01-02T00:00:00.000Z")],
      ["b", new Date("2026-01-05T00:00:00.000Z")],
    ]);

    const sortAt = computePayoutSortAt(row, undefined, subscribedAtByInvestmentId);
    assert.equal(sortAt.toISOString(), "2026-01-05T00:00:00.000Z");
  });
});
