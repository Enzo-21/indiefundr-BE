import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  PurchaseOrderStep,
} from "@prisma/client";
import { resetEnvCache } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getCurrentPurchaseOrder, subscribeToFund } from "./subscribe";

import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("subscribeToFund", () => {
  it(
    "rejects invalid fund",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Subscribe Test",
          email: `subscribe-${Date.now()}@example.com`,
        },
      });

      const result = await subscribeToFund(user.id, {
        fundId: "invalid-fund",
        cost: 25,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 400);
      }

      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "returns 409 when an active purchase order already exists",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Subscribe Active Order Test",
          email: `subscribe-active-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: "TArjbXnrL5qTZo6YrT1GzbKHYa3bJSj6Yr",
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });

      const fundId = "aggressive-alpha";
      const existingOrder = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId,
          costUsdt: 25,
          reservedUsdt: 25,
          status: PurchaseOrderStatus.processing,
          step: "validate",
        },
      });

      const ordersBefore = await prisma.purchaseOrder.count({
        where: { userId: user.id, fundId },
      });

      const result = await subscribeToFund(user.id, {
        fundId,
        cost: 25,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 409);
        const body = result.body as Record<string, unknown>;
        assert.equal(
          body.msg,
          "A subscription is already processing for this fund."
        );
        assert.equal(body.orderId, existingOrder.id);
      }

      const ordersAfter = await prisma.purchaseOrder.count({
        where: { userId: user.id, fundId },
      });
      assert.equal(ordersAfter, ordersBefore);

      await prisma.purchaseOrder.delete({ where: { id: existingOrder.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "returns 400 insufficient_usdt when available balance is reserved by another order",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Subscribe Insufficient Test",
          email: `subscribe-insuf-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: "TArjbXnrL5qTZo6YrT1GzbKHYa3bJSj6Yr",
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });

      const reservedOrder = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "aggressive-alpha",
          costUsdt: 25,
          reservedUsdt: 25,
          status: PurchaseOrderStatus.processing,
          step: "validate",
        },
      });

      const result = await subscribeToFund(user.id, {
        fundId: "growth",
        cost: 25,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 400);
        const body = result.body as Record<string, unknown>;
        assert.equal(body.code, "INSUFFICIENT_USDT");
      }

      const growthOrders = await prisma.purchaseOrder.count({
        where: { userId: user.id, fundId: "growth" },
      });
      assert.equal(growthOrders, 0);

      await prisma.purchaseOrder.delete({ where: { id: reservedOrder.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "getCurrentPurchaseOrder does not trigger processor tick for manual orders",
    { skip: skipDbTests },
    async () => {
      const originalProcessor = process.env.PURCHASE_ORDER_PROCESSOR_ENABLED;
      process.env.PURCHASE_ORDER_PROCESSOR_ENABLED = "true";
      resetEnvCache();
      const user = await prisma.user.create({
        data: {
          name: "Subscribe Manual Poll Test",
          email: `subscribe-manual-poll-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: "TArjbXnrL5qTZo6YrT1GzbKHYa3bJSj6Yr",
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });

      const order = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "aggressive-alpha",
          costUsdt: 25,
          reservedUsdt: 25,
          status: PurchaseOrderStatus.processing,
          step: PurchaseOrderStep.awaiting_trx,
          fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
        },
      });

      try {
        const result = await getCurrentPurchaseOrder(user.id, "aggressive-alpha");
        assert.equal(result.ok, true);
        const fresh = await prisma.purchaseOrder.findUniqueOrThrow({
          where: { id: order.id },
        });
        assert.equal(fresh.status, PurchaseOrderStatus.processing);
        assert.equal(fresh.step, PurchaseOrderStep.awaiting_trx);
        assert.equal(fresh.topUpTxId, null);
        assert.equal(fresh.usdtTxId, null);
      } finally {
        await prisma.purchaseOrder.delete({ where: { id: order.id } });
        await prisma.wallet.delete({ where: { id: wallet.id } });
        await prisma.user.delete({ where: { id: user.id } });
        if (originalProcessor === undefined) {
          delete process.env.PURCHASE_ORDER_PROCESSOR_ENABLED;
        } else {
          process.env.PURCHASE_ORDER_PROCESSOR_ENABLED = originalProcessor;
        }
        resetEnvCache();
      }
    }
  );
});
