import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentStatus,
  PurchaseOrderStatus,
  PurchaseOrderStep,
  type Investment,
  type PurchaseOrder,
} from "@prisma/client";
import {
  buildOrderSettlementView,
  deriveOrderSettlementPhaseFromDb,
  orderHasPaymentAttempt,
  resolvePurchaseOrderActivityDisplayStatus,
  settlementLabelForOrder,
  settlementPhaseLabel,
  settlementPhaseToDisplayStatus,
} from "./orderSettlementView";
import { computeInvestedBreakdown } from "@/services/wallets/investmentPortfolio";

function mockOrder(
  overrides: Partial<PurchaseOrder> = {}
): PurchaseOrder {
  return {
    id: "order1",
    userId: "user1",
    walletId: "wallet1",
    type: "subscribe_fund",
    fundId: "growth",
    costUsdt: 25,
    status: PurchaseOrderStatus.processing,
    step: PurchaseOrderStep.trx_topup,
    reservedUsdt: 25,
    estimatedTrx: 15,
    sponsoredTrx: 0,
    sponsorRound: 0,
    recoveredTrx: 0,
    trxBefore: 0,
    topUpTxId: null,
    topUpTxIds: [],
    usdtTxId: null,
    failedUsdtTxIds: [],
    sweepTxId: null,
    investmentId: null,
    subscribeInflowRecordedAt: null,
    failureReason: null,
    device: null,
    date: new Date(),
    updatedAt: new Date(),
    paymentChainOutcome: null,
    paymentChainTxId: null,
    paymentChainCheckedAt: null,
    paymentChainFinal: false,
    chainMemo: null,
    usdtBroadcastJson: null,
    ...overrides,
  } as PurchaseOrder;
}

describe("orderSettlementView", () => {
  it("maps TRX steps to fueling phase", () => {
    assert.equal(
      deriveOrderSettlementPhaseFromDb(
        mockOrder({ step: PurchaseOrderStep.trx_confirm })
      ),
      "fueling"
    );
  });

  it("maps usdt_transfer without txId to paying", () => {
    assert.equal(
      deriveOrderSettlementPhaseFromDb(
        mockOrder({ step: PurchaseOrderStep.usdt_transfer })
      ),
      "paying"
    );
  });

  it("maps usdt_confirm to confirming", () => {
    assert.equal(
      deriveOrderSettlementPhaseFromDb(
        mockOrder({
          step: PurchaseOrderStep.usdt_confirm,
          usdtTxId: "abc123",
        })
      ),
      "confirming"
    );
  });

  it("detects payment attempts from failed tx ids", () => {
    assert.equal(
      orderHasPaymentAttempt(
        mockOrder({ failedUsdtTxIds: ["deadbeef"] })
      ),
      true
    );
  });

  it("shows pending display while confirming on chain", () => {
    const view = buildOrderSettlementView(
      mockOrder({
        step: PurchaseOrderStep.usdt_confirm,
        usdtTxId: "abc",
        paymentChainOutcome: "pending",
      })
    );
    assert.equal(view.phase, "confirming");
    assert.equal(view.displayStatus, "pending");
  });

  it("labels settlement phases for UI", () => {
    assert.equal(settlementPhaseLabel("fueling"), "Preparing");
    assert.equal(settlementPhaseToDisplayStatus("succeeded", null), "confirmed");
  });

  it("labels fueling retry-pending orders as retrying", () => {
    const order = mockOrder({
      step: PurchaseOrderStep.trx_topup,
      failureReason: "retry_pending:TRX top-up failed on-chain",
    });
    assert.equal(
      settlementLabelForOrder(order, "fueling"),
      "Retrying"
    );
    assert.equal(
      buildOrderSettlementView(order).settlementLabel,
      "Retrying"
    );
  });

  it("labels fueling without retry marker as preparing", () => {
    const order = mockOrder({ step: PurchaseOrderStep.trx_topup });
    assert.equal(
      buildOrderSettlementView(order).settlementLabel,
      "Preparing"
    );
  });
});

describe("computeInvestedBreakdown", () => {
  it("does not double-count pending investment linked to active order", () => {
    const activeOrders = [{ id: "order1", reservedUsdt: 25 }];
    const investments = [
      {
        id: "inv1",
        amountUsdt: 25,
        status: InvestmentStatus.pending,
        purchaseOrderId: "order1",
      } as Investment,
    ];

    const breakdown = computeInvestedBreakdown(activeOrders, investments);
    assert.equal(breakdown.pendingOrdersInvested, 25);
    assert.equal(breakdown.pendingInvestments, 0);
    assert.equal(breakdown.investedBalance, 25);
  });

  it("counts orphan pending investment without active order", () => {
    const breakdown = computeInvestedBreakdown(
      [],
      [
        {
          id: "inv1",
          amountUsdt: 25,
          status: InvestmentStatus.pending,
          purchaseOrderId: "order-old",
        } as Investment,
      ]
    );
    assert.equal(breakdown.pendingInvestments, 25);
    assert.equal(breakdown.investedBalance, 25);
  });

  it("counts chain-success order not yet reflected in investments", () => {
    const breakdown = computeInvestedBreakdown(
      [],
      [],
      [
        {
          id: "order-paid",
          costUsdt: 25,
          reservedUsdt: 25,
          investmentId: null,
        },
      ]
    );
    assert.equal(breakdown.pendingInvestments, 25);
    assert.equal(breakdown.investedBalance, 25);
  });

  it("uses costUsdt when reservedUsdt is zero on active orders", () => {
    const breakdown = computeInvestedBreakdown(
      [{ id: "order1", costUsdt: 25, reservedUsdt: 0 }],
      []
    );
    assert.equal(breakdown.pendingOrdersInvested, 25);
    assert.equal(breakdown.investedBalance, 25);
  });

  it("does not double-count settled order with pending investment", () => {
    const breakdown = computeInvestedBreakdown(
      [],
      [
        {
          id: "inv1",
          amountUsdt: 25,
          status: InvestmentStatus.pending,
          purchaseOrderId: "order-paid",
        } as Investment,
      ],
      [{ id: "order-paid", costUsdt: 25, investmentId: "inv1" }]
    );
    assert.equal(breakdown.pendingInvestments, 25);
    assert.equal(breakdown.investedBalance, 25);
  });

  it("does not reserve USDT after broadcast when order is still processing", () => {
    const breakdown = computeInvestedBreakdown(
      [
        {
          id: "order-awaiting-review",
          costUsdt: 25,
          reservedUsdt: 25,
          usdtTxId: "tx-broadcast",
        },
      ],
      [
        {
          id: "inv1",
          amountUsdt: 25,
          status: InvestmentStatus.pending,
          purchaseOrderId: "order-awaiting-review",
        } as Investment,
      ]
    );
    assert.equal(breakdown.pendingOrdersInvested, 0);
    assert.equal(breakdown.pendingInvestments, 25);
    assert.equal(breakdown.investedBalance, 25);
  });

  it("counts broadcast active order without investment row as pending investment", () => {
    const breakdown = computeInvestedBreakdown(
      [{ id: "order-paid", costUsdt: 25, usdtTxId: "tx-abc" }],
      []
    );
    assert.equal(breakdown.pendingOrdersInvested, 0);
    assert.equal(breakdown.pendingInvestments, 25);
    assert.equal(breakdown.investedBalance, 25);
  });
});

describe("resolvePurchaseOrderActivityDisplayStatus", () => {
  it("keeps pending while chain paid but investment not activated", () => {
    const order = mockOrder({
      step: PurchaseOrderStep.usdt_confirm,
      usdtTxId: "abc",
      paymentChainOutcome: "success",
    });
    const settlement = buildOrderSettlementView(order);
    assert.equal(
      resolvePurchaseOrderActivityDisplayStatus(order, settlement, {
        status: InvestmentStatus.pending,
      }),
      "pending"
    );
  });

  it("shows confirmed when order completed", () => {
    const order = mockOrder({ status: PurchaseOrderStatus.completed });
    const settlement = buildOrderSettlementView(order);
    assert.equal(
      resolvePurchaseOrderActivityDisplayStatus(order, settlement, null),
      "confirmed"
    );
  });

  it("shows confirmed when linked investment is active", () => {
    const order = mockOrder({
      paymentChainOutcome: "success",
      usdtTxId: "abc",
    });
    const settlement = buildOrderSettlementView(order);
    assert.equal(
      resolvePurchaseOrderActivityDisplayStatus(order, settlement, {
        status: InvestmentStatus.active,
      }),
      "confirmed"
    );
  });
});
