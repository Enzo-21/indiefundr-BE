import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PurchaseOrderStatus,
  PurchaseOrderStep,
  type PurchaseOrder,
} from "@prisma/client";
import { resetEnvCache } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";
import {
  ALREADY_PROCESSING,
  CANCEL_DISABLED,
  CANCEL_NOT_ALLOWED,
  cancelPurchaseOrder,
  isPurchaseOrderCancellable,
} from "./cancelPurchaseOrder";
import { ACTIVE_PURCHASE_ORDER_STATUSES } from "@/services/wallets/walletBalance";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

function mockOrder(
  overrides: Partial<PurchaseOrder> = {}
): Pick<
  PurchaseOrder,
  "status" | "topUpTxId" | "usdtTxId" | "sponsoredTrx"
> {
  return {
    status: PurchaseOrderStatus.queued,
    topUpTxId: null,
    usdtTxId: null,
    sponsoredTrx: 0,
    ...overrides,
  };
}

describe("isPurchaseOrderCancellable", () => {
  it("allows queued/processing with no on-chain work", () => {
    assert.equal(isPurchaseOrderCancellable(mockOrder()), true);
    assert.equal(
      isPurchaseOrderCancellable(
        mockOrder({ status: PurchaseOrderStatus.processing })
      ),
      true
    );
  });

  it("refuses completed, failed, and cancelled", () => {
    assert.equal(
      isPurchaseOrderCancellable(
        mockOrder({ status: PurchaseOrderStatus.completed })
      ),
      false
    );
    assert.equal(
      isPurchaseOrderCancellable(
        mockOrder({ status: PurchaseOrderStatus.failed })
      ),
      false
    );
    assert.equal(
      isPurchaseOrderCancellable(
        mockOrder({ status: PurchaseOrderStatus.cancelled })
      ),
      false
    );
  });

  it("refuses when TRX top-up, USDT tx, or sponsored TRX started", () => {
    assert.equal(
      isPurchaseOrderCancellable(mockOrder({ topUpTxId: "txid" })),
      false
    );
    assert.equal(
      isPurchaseOrderCancellable(mockOrder({ usdtTxId: "usdt" })),
      false
    );
    assert.equal(
      isPurchaseOrderCancellable(mockOrder({ sponsoredTrx: 1.5 })),
      false
    );
  });
});

describe("cancelPurchaseOrder", () => {
  it(
    "refuses on mainnet",
    { skip: skipDbTests },
    async () => {
      const prev = process.env.BLOCKCHAIN_NETWORK;
      process.env.BLOCKCHAIN_NETWORK = "mainnet";
      resetEnvCache();

      try {
        const result = await cancelPurchaseOrder("user1", "order1");
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.status, 403);
          assert.equal(
            (result.body as { code?: string }).code,
            CANCEL_DISABLED
          );
        }
      } finally {
        process.env.BLOCKCHAIN_NETWORK = prev;
        resetEnvCache();
      }
    }
  );

  it(
    "cancels queued order and drops it from reserved statuses",
    { skip: skipDbTests },
    async () => {
      const prev = process.env.BLOCKCHAIN_NETWORK;
      process.env.BLOCKCHAIN_NETWORK = "testnet";
      resetEnvCache();

      const stamp = Date.now();
      const user = await prisma.user.create({
        data: {
          name: "Cancel Order Test",
          email: `cancel-order-${stamp}@example.com`,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TCancel${stamp}`.slice(0, 34).padEnd(34, "1"),
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });
      const order = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "aggressive-alpha",
          costUsdt: 50,
          reservedUsdt: 50,
          status: PurchaseOrderStatus.queued,
          step: PurchaseOrderStep.awaiting_trx,
        },
      });

      try {
        const result = await cancelPurchaseOrder(user.id, order.id);
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.data.status, PurchaseOrderStatus.cancelled);
          assert.equal(result.data.displayStatus, "cancelled");
          assert.equal(result.data.settlementLabel, "Cancelled");
        }

        const fresh = await prisma.purchaseOrder.findUnique({
          where: { id: order.id },
        });
        assert.equal(fresh?.status, PurchaseOrderStatus.cancelled);
        assert.equal(fresh?.step, PurchaseOrderStep.done);
        assert.equal(fresh?.failureReason, "user_cancelled");
        assert.equal(
          ACTIVE_PURCHASE_ORDER_STATUSES.includes(
            fresh!.status as (typeof ACTIVE_PURCHASE_ORDER_STATUSES)[number]
          ),
          false
        );
      } finally {
        await prisma.purchaseOrder.deleteMany({ where: { userId: user.id } });
        await prisma.wallet.delete({ where: { id: wallet.id } });
        await prisma.user.delete({ where: { id: user.id } });
        process.env.BLOCKCHAIN_NETWORK = prev;
        resetEnvCache();
      }
    }
  );

  it(
    "refuses cancel after on-chain work started",
    { skip: skipDbTests },
    async () => {
      const prev = process.env.BLOCKCHAIN_NETWORK;
      process.env.BLOCKCHAIN_NETWORK = "testnet";
      resetEnvCache();

      const stamp = Date.now();
      const user = await prisma.user.create({
        data: {
          name: "Cancel Blocked Test",
          email: `cancel-blocked-${stamp}@example.com`,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TBlock${stamp}`.slice(0, 34).padEnd(34, "2"),
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });
      const order = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "aggressive-alpha",
          costUsdt: 50,
          reservedUsdt: 50,
          status: PurchaseOrderStatus.processing,
          step: PurchaseOrderStep.trx_topup,
          topUpTxId: "topup-tx",
        },
      });

      try {
        const result = await cancelPurchaseOrder(user.id, order.id);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.status, 400);
          assert.equal(
            (result.body as { code?: string }).code,
            ALREADY_PROCESSING
          );
        }
        const fresh = await prisma.purchaseOrder.findUnique({
          where: { id: order.id },
        });
        assert.equal(fresh?.status, PurchaseOrderStatus.processing);
      } finally {
        await prisma.purchaseOrder.deleteMany({ where: { userId: user.id } });
        await prisma.wallet.delete({ where: { id: wallet.id } });
        await prisma.user.delete({ where: { id: user.id } });
        process.env.BLOCKCHAIN_NETWORK = prev;
        resetEnvCache();
      }
    }
  );

  it(
    "refuses cancel when already cancelled",
    { skip: skipDbTests },
    async () => {
      const prev = process.env.BLOCKCHAIN_NETWORK;
      process.env.BLOCKCHAIN_NETWORK = "testnet";
      resetEnvCache();

      const stamp = Date.now();
      const user = await prisma.user.create({
        data: {
          name: "Cancel Again Test",
          email: `cancel-again-${stamp}@example.com`,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TAgain${stamp}`.slice(0, 34).padEnd(34, "3"),
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });
      const order = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "aggressive-alpha",
          costUsdt: 50,
          reservedUsdt: 50,
          status: PurchaseOrderStatus.cancelled,
          step: PurchaseOrderStep.done,
          failureReason: "user_cancelled",
        },
      });

      try {
        const result = await cancelPurchaseOrder(user.id, order.id);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.status, 400);
          assert.equal(
            (result.body as { code?: string }).code,
            CANCEL_NOT_ALLOWED
          );
        }
      } finally {
        await prisma.purchaseOrder.deleteMany({ where: { userId: user.id } });
        await prisma.wallet.delete({ where: { id: wallet.id } });
        await prisma.user.delete({ where: { id: user.id } });
        process.env.BLOCKCHAIN_NETWORK = prev;
        resetEnvCache();
      }
    }
  );
});
