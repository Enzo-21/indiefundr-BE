import assert from "node:assert/strict";
import { TreasuryEventType } from "@prisma/client";
import { describe, it } from "node:test";
import {
  buildInvestmentLedgerViewsFromEvents,
  protectedWithdrawable,
  resolveLedgerEventKind,
} from "./investmentLedgerSnapshots";

describe("investmentLedgerSnapshots", () => {
  it("protectedWithdrawable is pool minus surplus", () => {
    assert.equal(protectedWithdrawable(75, 16.26), 58.74);
    assert.equal(protectedWithdrawable(10, 15), 0);
  });

  it("maps subscribe and payout events per investment", () => {
    const investments = [
      {
        id: "inv-1",
        payoutTriggeredBy: "admin",
        projectedPayoutUsdt: 28.75,
      },
      {
        id: "inv-2",
        payoutTriggeredBy: "admin_surplus_liquidity",
        projectedPayoutUsdt: 28.75,
      },
    ] as const;

    const views = buildInvestmentLedgerViewsFromEvents(
      [...investments],
      [
        {
          id: "e1",
          investmentId: "inv-1",
          type: TreasuryEventType.subscribe_inflow,
          poolAfter: 25,
          surplusAfter: 5.42,
          amountUsdt: 25,
          purchaseOrderId: null,
          withdrawalId: null,
          protectedCreditedAfter: null,
          protectedWithdrawnAfter: null,
          meta: null,
          createdAt: new Date("2026-01-01"),
        },
        {
          id: "e2",
          investmentId: "inv-1",
          type: TreasuryEventType.payout_outflow,
          poolAfter: 46.25,
          surplusAfter: 16.26,
          amountUsdt: 28.75,
          purchaseOrderId: null,
          withdrawalId: null,
          protectedCreditedAfter: null,
          protectedWithdrawnAfter: null,
          meta: null,
          createdAt: new Date("2026-01-02"),
        },
        {
          id: "e3",
          investmentId: "inv-2",
          type: TreasuryEventType.subscribe_inflow,
          poolAfter: 71.25,
          surplusAfter: 21.68,
          amountUsdt: 25,
          purchaseOrderId: null,
          withdrawalId: null,
          protectedCreditedAfter: null,
          protectedWithdrawnAfter: null,
          meta: null,
          createdAt: new Date("2026-01-03"),
        },
      ]
    );

    const inv1 = views.get("inv-1");
    assert.ok(inv1?.afterSubscribe);
    assert.equal(inv1.afterSubscribe.pool, 25);
    assert.equal(inv1.afterSubscribe.protectedWithdrawable, 19.58);
    assert.ok(inv1.afterPayout);
    assert.equal(inv1.afterPayout.pool, 46.25);
    assert.ok(inv1.subscribeEventCreatedAt);
    assert.ok(inv1.payoutEventCreatedAt);
    assert.equal(inv1.eventKind, "payout");

    const inv2 = views.get("inv-2");
    assert.ok(inv2?.afterSubscribe);
    assert.equal(inv2.afterPayout, null);
    assert.equal(inv2.eventKind, "subscription");
  });

  it("sums surplus_credit and surplus_draw per investment", () => {
    const investments = [
      { id: "inv-1", payoutTriggeredBy: "admin", projectedPayoutUsdt: 35 },
    ] as const;

    const views = buildInvestmentLedgerViewsFromEvents(
      [...investments],
      [
        {
          id: "e1",
          investmentId: "inv-1",
          type: TreasuryEventType.subscribe_inflow,
          poolAfter: 25,
          surplusAfter: 3.33,
          amountUsdt: 25,
          purchaseOrderId: null,
          withdrawalId: null,
          protectedCreditedAfter: null,
          protectedWithdrawnAfter: null,
          meta: null,
          createdAt: new Date("2026-01-01"),
        },
        {
          id: "e2",
          investmentId: "inv-1",
          type: TreasuryEventType.surplus_credit,
          poolAfter: 25,
          surplusAfter: 3.33,
          amountUsdt: 3.33,
          purchaseOrderId: null,
          withdrawalId: null,
          protectedCreditedAfter: null,
          protectedWithdrawnAfter: null,
          meta: null,
          createdAt: new Date("2026-01-01"),
        },
        {
          id: "e3",
          investmentId: "inv-1",
          type: TreasuryEventType.surplus_draw,
          poolAfter: 50,
          surplusAfter: 0,
          amountUsdt: 28.75,
          purchaseOrderId: null,
          withdrawalId: null,
          protectedCreditedAfter: null,
          protectedWithdrawnAfter: null,
          meta: null,
          createdAt: new Date("2026-01-02"),
        },
      ]
    );

    const inv1 = views.get("inv-1");
    assert.equal(inv1?.subscribeSurplusCredit, 3.33);
    assert.equal(inv1?.payoutSurplusDraw, 28.75);
  });

  it("resolveLedgerEventKind distinguishes surplus payout", () => {
    assert.equal(
      resolveLedgerEventKind({ payoutTriggeredBy: null }, false),
      "subscription"
    );
    assert.equal(
      resolveLedgerEventKind({ payoutTriggeredBy: "admin" }, true),
      "payout"
    );
    assert.equal(
      resolveLedgerEventKind(
        { payoutTriggeredBy: "admin_surplus_liquidity" },
        true
      ),
      "surplus_payout"
    );
  });
});
