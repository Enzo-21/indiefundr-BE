import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeFundActivityRows,
  orphanWalletActivityDeleteWhere,
  shouldShowPurchaseOrderAsFailed,
  walletActivityRecordToTx,
} from "./walletActivityMaterializer";
import { REFERRAL_WALLET_ACTIVITY_KINDS } from "@/services/referrals/referralWalletActivity";
import { PurchaseOrderStatus } from "@prisma/client";

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
});
