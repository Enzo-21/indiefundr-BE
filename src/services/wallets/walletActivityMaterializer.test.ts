import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeFundActivityRows,
  appendUsdtPurchaseActivityRow,
  orphanWalletActivityDeleteWhere,
  shouldShowPurchaseOrderAsFailed,
  walletActivityRecordToTx,
} from "./walletActivityMaterializer";
import { REFERRAL_WALLET_ACTIVITY_KINDS } from "@/services/referrals/referralWalletActivity";
import { PurchaseOrderStatus, UsdtPurchaseOrderStatus } from "@prisma/client";

describe("dedupeFundActivityRows", () => {
  it("keeps investment row over completed purchase_order for same txId", () => {
    const occurredAt = new Date("2026-01-01T00:00:00.000Z");
    const deduped = dedupeFundActivityRows([
      {
        kind: "purchase_order",
        entityId: "order1",
        txId: "tx-abc",
        type: "out",
        amountUsdt: 25,
        status: "confirmed",
        label: "Investment order (Fund A)",
        occurredAt,
        tronscanUrl: null,
        chainFinal: true,
      },
      {
        kind: "investment",
        entityId: "inv1",
        txId: "tx-abc",
        type: "out",
        amountUsdt: 25,
        status: "confirmed",
        label: "Investment order (Fund A)",
        occurredAt,
        tronscanUrl: null,
        chainFinal: true,
      },
    ]);

    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]?.kind, "investment");
    assert.equal(deduped[0]?.entityId, "inv1");
  });
});

describe("shouldShowPurchaseOrderAsFailed", () => {
  it("returns false when status failed but paymentChainOutcome is null", () => {
    assert.equal(
      shouldShowPurchaseOrderAsFailed({
        status: PurchaseOrderStatus.failed,
        paymentChainOutcome: null,
      } as Parameters<typeof shouldShowPurchaseOrderAsFailed>[0]),
      false
    );
  });

  it("returns false when paymentChainOutcome is success", () => {
    assert.equal(
      shouldShowPurchaseOrderAsFailed({
        status: PurchaseOrderStatus.failed,
        paymentChainOutcome: "success",
      } as Parameters<typeof shouldShowPurchaseOrderAsFailed>[0]),
      false
    );
  });

  it("returns true only when paymentChainOutcome is failed", () => {
    assert.equal(
      shouldShowPurchaseOrderAsFailed({
        status: PurchaseOrderStatus.failed,
        paymentChainOutcome: "failed",
      } as Parameters<typeof shouldShowPurchaseOrderAsFailed>[0]),
      true
    );
  });
});

describe("orphanWalletActivityDeleteWhere", () => {
  it("excludes referral wallet activity kinds when pruning orphans", () => {
    const where = orphanWalletActivityDeleteWhere("wallet1", ["kept1"]);
    assert.deepEqual(where.kind, { notIn: [...REFERRAL_WALLET_ACTIVITY_KINDS] });
    assert.deepEqual(where.id, { notIn: ["kept1"] });
    assert.equal(where.walletId, "wallet1");
  });

  it("still preserves referral rows when no materialized rows were kept", () => {
    const where = orphanWalletActivityDeleteWhere("wallet1", []);
    assert.deepEqual(where.kind, { notIn: [...REFERRAL_WALLET_ACTIVITY_KINDS] });
    assert.equal(where.walletId, "wallet1");
    assert.equal("id" in where, false);
  });
});

describe("walletActivityRecordToTx", () => {
  it("maps investment rows to app activity ids", () => {
    const tx = walletActivityRecordToTx({
      id: "abc",
      kind: "investment",
      entityId: "inv1",
      txId: "tx123",
      type: "out",
      amountUsdt: 25,
      status: "confirmed",
      label: "Investment order (Fund A)",
      detail: null,
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      tronscanUrl: "https://example.com/tx",
      pendingTapInfo: null,
    });

    assert.equal(tx.id, "investment-inv1");
    assert.equal(tx.source, "app");
    assert.equal(tx.txId, "tx123");
  });

  it("maps inviter referral pending rows to entityId activity ids", () => {
    const tx = walletActivityRecordToTx({
      id: "507f1f77bcf86cd799439098",
      kind: "referral_bonus_pending",
      entityId: "referral-inviter-pending:invite1",
      txId: null,
      type: "in",
      amountUsdt: 2,
      status: "pending",
      label: "Referral reward",
      detail: "j***@email.com",
      occurredAt: new Date("2026-01-03T00:00:00.000Z"),
      tronscanUrl: null,
      pendingTapInfo: null,
    });

    assert.equal(tx.id, "referral-inviter-pending:invite1");
    assert.equal(tx.label, "Referral reward");
  });

  it("maps referral pending rows to entityId activity ids", () => {
    const tx = walletActivityRecordToTx({
      id: "507f1f77bcf86cd799439099",
      kind: "referral_bonus_pending",
      entityId: "referral-pending:user1",
      txId: null,
      type: "in",
      amountUsdt: 2,
      status: "pending",
      label: "Referral bonus",
      detail: "FRIEND99",
      occurredAt: new Date("2026-01-03T00:00:00.000Z"),
      tronscanUrl: null,
      pendingTapInfo: {
        title: "Referral bonus pending",
        message: "Unlock after first investment.",
      },
    });

    assert.equal(tx.id, "referral-pending:user1");
    assert.equal(tx.source, "app");
    assert.equal(tx.status, "pending");
  });

  it("maps usdt_transfer rows to chain activity ids", () => {
    const tx = walletActivityRecordToTx({
      id: "def",
      kind: "usdt_transfer",
      entityId: "transfer1",
      txId: "chaintx",
      type: "in",
      amountUsdt: 10,
      status: "confirmed",
      label: "USDT received",
      detail: null,
      occurredAt: new Date("2026-01-02T00:00:00.000Z"),
      tronscanUrl: "https://example.com/tx2",
      pendingTapInfo: null,
    });

    assert.equal(tx.id, "chain-chaintx");
    assert.equal(tx.source, "chain");
  });

  it("maps usdt_purchase_order and usdt_purchase to stable usdt-purchase ids", () => {
    const pending = walletActivityRecordToTx({
      id: "row1",
      kind: "usdt_purchase_order",
      entityId: "order-mp-1",
      txId: null,
      type: "in",
      amountUsdt: 50,
      status: "pending",
      label: "USDT purchase",
      detail: "Mercado Pago",
      occurredAt: new Date("2026-01-04T00:00:00.000Z"),
      tronscanUrl: null,
      pendingTapInfo: null,
    });
    const confirmed = walletActivityRecordToTx({
      id: "row2",
      kind: "usdt_purchase",
      entityId: "order-mp-1",
      txId: "tx-release",
      type: "in",
      amountUsdt: 50,
      status: "confirmed",
      label: "USDT purchase",
      detail: "Mercado Pago",
      occurredAt: new Date("2026-01-05T00:00:00.000Z"),
      tronscanUrl: "https://example.com/tx-release",
      pendingTapInfo: null,
    });

    assert.equal(pending.id, "usdt-purchase-order-mp-1");
    assert.equal(confirmed.id, "usdt-purchase-order-mp-1");
    assert.equal(confirmed.source, "app");
    assert.equal(confirmed.txId, "tx-release");
  });

  it("overrides pending redemption to confirmed when insights show redeemed", () => {
    const tx = walletActivityRecordToTx(
      {
        id: "row-redemption",
        kind: "redemption",
        entityId: "inv-1",
        txId: "tx-payout",
        type: "in",
        amountUsdt: 110,
        status: "pending",
        label: "Earnings credited",
        detail: null,
        occurredAt: new Date("2026-01-06T00:00:00.000Z"),
        tronscanUrl: null,
        pendingTapInfo: null,
      },
      {
        kind: "redemption",
        fundId: "growth",
        fundName: "Growth Fund",
        principalUsdt: 100,
        projectedPayoutUsdt: 110,
        targetReturnPercent: 10,
        expectedEarningsUsdt: 10,
        maxTermDays: 90,
        typicalPayoutDays: 90,
        subscribedAt: "2026-01-01T00:00:00.000Z",
        maturesAt: "2026-04-01T00:00:00.000Z",
        redeemedAt: "2026-04-02T00:00:00.000Z",
        payoutDaysElapsed: null,
        creditedUsdt: 110,
        investmentId: "inv-1",
        purchaseOrderId: null,
        investmentStatus: "redeemed",
      }
    );

    assert.equal(tx.status, "confirmed");
  });
});

describe("appendUsdtPurchaseActivityRow", () => {
  const base = {
    id: "usdt-ord-1",
    amountUsdt: 100,
    totalArs: 125000,
    adminUsdtTxId: null as string | null,
    failureReason: null as string | null,
    date: new Date("2026-01-04T00:00:00.000Z"),
    updatedAt: new Date("2026-01-04T01:00:00.000Z"),
    adminSettledAt: null as Date | null,
  };

  it("skips pending_payment and expired", () => {
    const rows: Parameters<typeof appendUsdtPurchaseActivityRow>[0] = [];
    appendUsdtPurchaseActivityRow(rows, {
      ...base,
      status: UsdtPurchaseOrderStatus.pending_payment,
    });
    appendUsdtPurchaseActivityRow(rows, {
      ...base,
      status: UsdtPurchaseOrderStatus.expired,
    });
    assert.equal(rows.length, 0);
  });

  it("materializes awaiting_admin as pending usdt_purchase_order", () => {
    const rows: Parameters<typeof appendUsdtPurchaseActivityRow>[0] = [];
    appendUsdtPurchaseActivityRow(rows, {
      ...base,
      status: UsdtPurchaseOrderStatus.awaiting_admin,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.kind, "usdt_purchase_order");
    assert.equal(rows[0]?.status, "pending");
    assert.equal(rows[0]?.type, "in");
    assert.equal(rows[0]?.entityId, "usdt-ord-1");
    assert.ok(rows[0]?.pendingTapInfo);
  });

  it("materializes completed as confirmed usdt_purchase with txId", () => {
    const rows: Parameters<typeof appendUsdtPurchaseActivityRow>[0] = [];
    appendUsdtPurchaseActivityRow(rows, {
      ...base,
      status: UsdtPurchaseOrderStatus.completed,
      adminUsdtTxId: "tx-abc",
      adminSettledAt: new Date("2026-01-05T00:00:00.000Z"),
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.kind, "usdt_purchase");
    assert.equal(rows[0]?.status, "confirmed");
    assert.equal(rows[0]?.txId, "tx-abc");
    assert.ok(rows[0]?.tronscanUrl);
  });

  it("materializes failed as failed usdt_purchase_order with user-facing detail", () => {
    const rows: Parameters<typeof appendUsdtPurchaseActivityRow>[0] = [];
    appendUsdtPurchaseActivityRow(rows, {
      ...base,
      status: UsdtPurchaseOrderStatus.failed,
      failureReason: "auto_return invalid. back_url.success must be defined",
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.kind, "usdt_purchase_order");
    assert.equal(rows[0]?.status, "failed");
    assert.equal(rows[0]?.detail, "Purchase could not be completed.");
    assert.notEqual(
      rows[0]?.detail,
      "auto_return invalid. back_url.success must be defined"
    );
  });
});
