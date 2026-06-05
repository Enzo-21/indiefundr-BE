import assert from "node:assert/strict";
import { describe, it, mock, afterEach } from "node:test";
import {
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  PurchaseOrderStep,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { broadcastAdminTrxTopUp } from "./purchaseOrderFulfillment";
import * as tron from "@/services/tron/client";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;
const hasTreasuryConfig = Boolean(
  getEnv().treasuryAddress?.trim() && getEnv().treasuryPrivateKey?.trim()
);

function mockEstimate(partial: {
  estimatedTrx: number;
  trxBalance: number;
  hasEnoughTrx: boolean;
  hasEnoughUsdt?: boolean;
}) {
  return mock.method(tron, "estimateUsdtTransfer", async () => ({
    fromAddress: "TFrom",
    toAddress: "TTo",
    amountUsdt: 25,
    energyUsed: 0,
    energyAvailable: 0,
    energyBillable: 0,
    energyPriceSun: 420,
    estimatedTrx: partial.estimatedTrx,
    estimatedTrxBase: partial.estimatedTrx,
    feeBufferPercent: 15,
    trxBalance: partial.trxBalance,
    usdtBalance: 25,
    hasEnoughTrx: partial.hasEnoughTrx,
    hasEnoughUsdt: partial.hasEnoughUsdt ?? true,
    canTransfer: true,
  }));
}

describe("broadcastAdminTrxTopUp", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it(
    "skips TRX broadcast when wallet balance covers buffered target",
    { skip: skipDbTests || !hasTreasuryConfig },
    async () => {
      mockEstimate({
        estimatedTrx: 4,
        trxBalance: 10,
        hasEnoughTrx: true,
      });

      let transferCalled = false;
      mock.method(tron, "transferTrx", async () => {
        transferCalled = true;
        return { txID: "should-not-broadcast" };
      });

      const user = await prisma.user.create({
        data: {
          name: "Admin Complete Skip TRX",
          email: `admin-complete-skip-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: "TAdminCompleteSkipTrxWallet123456789",
          privateKey: "test-private-key",
        },
      });

      const order = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth",
          costUsdt: 25,
          reservedUsdt: 25,
          status: PurchaseOrderStatus.processing,
          step: PurchaseOrderStep.awaiting_trx,
          fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
        },
      });

      const result = await broadcastAdminTrxTopUp(order.id);

      assert.equal(transferCalled, false);
      assert.equal(result.skipped, true);
      assert.equal(result.txId, null);
      assert.equal(result.amountTrx, 0);

      const fresh = await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      assert.equal(fresh.step, PurchaseOrderStep.awaiting_usdt);

      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "broadcasts buffered TRX amount when wallet is partially funded",
    { skip: skipDbTests || !hasTreasuryConfig },
    async () => {
      mockEstimate({
        estimatedTrx: 4,
        trxBalance: 2,
        hasEnoughTrx: false,
      });

      const transferred: number[] = [];
      mock.method(tron, "transferTrx", async ({ amountTrx }) => {
        transferred.push(amountTrx);
        return { txID: "mock-shortfall-trx-tx" };
      });
      mock.method(tron, "getTxId", () => "mock-shortfall-trx-tx");

      const user = await prisma.user.create({
        data: {
          name: "Admin Complete Shortfall TRX",
          email: `admin-complete-shortfall-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: "TAdminCompleteShortfallWallet123456789",
          privateKey: "test-private-key",
        },
      });

      const order = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth",
          costUsdt: 25,
          reservedUsdt: 25,
          status: PurchaseOrderStatus.processing,
          step: PurchaseOrderStep.awaiting_trx,
          fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
        },
      });

      const result = await broadcastAdminTrxTopUp(order.id);

      assert.deepEqual(transferred, [4]);
      assert.equal(result.skipped, false);
      assert.equal(result.txId, "mock-shortfall-trx-tx");
      assert.equal(result.amountTrx, 4);
      assert.equal(result.targetTrx, 6);

      const fresh = await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      assert.equal(fresh.trxBefore, 2);

      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
