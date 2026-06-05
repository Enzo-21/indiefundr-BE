import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import {
  InvestmentStatus,
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  PurchaseOrderStep,
} from "@prisma/client";
import { resetEnvCache } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  clearFailedTopUpTxRecord,
  failOrder,
  isTrxSponsorRoundCapReached,
  processPendingPurchaseOrders,
  processPurchaseOrder,
} from "./purchaseOrderProcessor";

import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("purchaseOrderProcessor", () => {
  const originalProcessorFlag = process.env.PURCHASE_ORDER_PROCESSOR_ENABLED;
  const originalTreasuryAddress = process.env.TREASURY_ADDRESS;
  const originalTreasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
  const originalTopupWaitMs = process.env.TREASURY_TRX_TOPUP_WAIT_MS;
  const originalTopupMaxRounds = process.env.TREASURY_TRX_TOPUP_MAX_ROUNDS;

  after(() => {
    if (originalProcessorFlag === undefined) {
      delete process.env.PURCHASE_ORDER_PROCESSOR_ENABLED;
    } else {
      process.env.PURCHASE_ORDER_PROCESSOR_ENABLED = originalProcessorFlag;
    }
    if (originalTreasuryAddress === undefined) {
      delete process.env.TREASURY_ADDRESS;
    } else {
      process.env.TREASURY_ADDRESS = originalTreasuryAddress;
    }
    if (originalTreasuryPrivateKey === undefined) {
      delete process.env.TREASURY_PRIVATE_KEY;
    } else {
      process.env.TREASURY_PRIVATE_KEY = originalTreasuryPrivateKey;
    }
    if (originalTopupWaitMs === undefined) {
      delete process.env.TREASURY_TRX_TOPUP_WAIT_MS;
    } else {
      process.env.TREASURY_TRX_TOPUP_WAIT_MS = originalTopupWaitMs;
    }
    if (originalTopupMaxRounds === undefined) {
      delete process.env.TREASURY_TRX_TOPUP_MAX_ROUNDS;
    } else {
      process.env.TREASURY_TRX_TOPUP_MAX_ROUNDS = originalTopupMaxRounds;
    }
    resetEnvCache();
  });

  it("detects TRX sponsor round cap from env", () => {
    process.env.TREASURY_TRX_TOPUP_MAX_ROUNDS = "5";
    resetEnvCache();
    assert.equal(
      isTrxSponsorRoundCapReached({
        sponsorRound: 5,
      } as Parameters<typeof isTrxSponsorRoundCapReached>[0]),
      true
    );
    assert.equal(
      isTrxSponsorRoundCapReached({
        sponsorRound: 4,
      } as Parameters<typeof isTrxSponsorRoundCapReached>[0]),
      false
    );
  });

  it("processPurchaseOrder is a no-op when processor disabled", async () => {
    process.env.PURCHASE_ORDER_PROCESSOR_ENABLED = "false";
    resetEnvCache();
    await assert.doesNotReject(() =>
      processPurchaseOrder("000000000000000000000000")
    );
  });

  it(
    "processPurchaseOrder is a no-op for manual fulfillment orders",
    { skip: skipDbTests },
    async () => {
      process.env.PURCHASE_ORDER_PROCESSOR_ENABLED = "true";
      process.env.TREASURY_ADDRESS = "TMockTreasuryAddressManualNoop123";
      process.env.TREASURY_PRIVATE_KEY = "mock-treasury-private-key";
      resetEnvCache();

      const user = await prisma.user.create({
        data: {
          name: "Processor Manual Noop Test",
          email: `po-manual-noop-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: "TTestAddressForProcessorManualNoop12345",
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

      await processPurchaseOrder(order.id);

      const fresh = await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      assert.equal(fresh.status, PurchaseOrderStatus.processing);
      assert.equal(fresh.step, PurchaseOrderStep.awaiting_trx);
      assert.equal(fresh.topUpTxId, null);
      assert.equal(fresh.usdtTxId, null);

      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "processPendingPurchaseOrders skips manual fulfillment orders",
    { skip: skipDbTests },
    async () => {
      process.env.PURCHASE_ORDER_PROCESSOR_ENABLED = "true";
      process.env.TREASURY_ADDRESS = "TMockTreasuryAddressManualPending123";
      process.env.TREASURY_PRIVATE_KEY = "mock-treasury-private-key";
      resetEnvCache();

      const user = await prisma.user.create({
        data: {
          name: "Processor Manual Pending Test",
          email: `po-manual-pending-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: "TTestAddressForProcessorManualPending123",
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
          status: PurchaseOrderStatus.queued,
          step: PurchaseOrderStep.awaiting_trx,
          fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
        },
      });

      const summary = await processPendingPurchaseOrders({ limit: 10 });
      assert.match(summary, /Purchase orders processed: 0/);

      const fresh = await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      assert.equal(fresh.status, PurchaseOrderStatus.queued);
      assert.equal(fresh.step, PurchaseOrderStep.awaiting_trx);
      assert.equal(fresh.topUpTxId, null);
      assert.equal(fresh.usdtTxId, null);

      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "keeps retry-pending orders in processing during backoff window",
    { skip: skipDbTests },
    async () => {
      process.env.PURCHASE_ORDER_PROCESSOR_ENABLED = "true";
      process.env.TREASURY_ADDRESS = "TMockTreasuryAddressForRetryPending123";
      process.env.TREASURY_PRIVATE_KEY = "mock-treasury-private-key";
      process.env.TREASURY_TRX_TOPUP_WAIT_MS = "999999";
      resetEnvCache();

      const user = await prisma.user.create({
        data: {
          name: "Processor Retry Pending Test",
          email: `po-retry-pending-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: "TTestAddressForProcessorRetryPending12345",
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
          step: PurchaseOrderStep.validate,
          failureReason: "retry_pending:TRX top-up failed on-chain",
        },
      });

      await processPurchaseOrder(order.id);

      const updated = await prisma.purchaseOrder.findUnique({
        where: { id: order.id },
      });
      assert.equal(updated?.status, PurchaseOrderStatus.processing);
      assert.equal(updated?.step, PurchaseOrderStep.validate);
      assert.equal(
        updated?.failureReason,
        "retry_pending:TRX top-up failed on-chain"
      );

      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "failOrder moves pending investment to FailedInvestment",
    { skip: skipDbTests },
    async () => {
      process.env.PURCHASE_ORDER_PROCESSOR_ENABLED = "true";

      const user = await prisma.user.create({
        data: {
          name: "Processor Fail Test",
          email: `po-fail-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: "TTestAddressForProcessorFail1234567890",
          privateKey: "test-private-key",
        },
      });

      const investment = await prisma.investment.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth",
          amountUsdt: 25,
          returnPercent90d: 10,
          projectedPayoutUsdt: 27.5,
          status: InvestmentStatus.pending,
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
          step: PurchaseOrderStep.usdt_confirm,
          investmentId: investment.id,
        },
      });

      await failOrder(order, "Test failure reason");

      const failedRow = await prisma.failedInvestment.findFirst({
        where: { userId: user.id, fundId: "growth" },
      });
      assert.ok(failedRow);
      assert.equal(failedRow?.amountUsdt, 25);

      const investmentGone = await prisma.investment.findUnique({
        where: { id: investment.id },
      });
      assert.equal(investmentGone, null);

      const updatedOrder = await prisma.purchaseOrder.findUnique({
        where: { id: order.id },
      });
      assert.equal(updatedOrder?.status, PurchaseOrderStatus.failed);
      assert.equal(updatedOrder?.failureReason, "Test failure reason");

      await prisma.failedInvestment.deleteMany({ where: { userId: user.id } });
      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "clearFailedTopUpTxRecord clears active top-up and keeps history",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Clear Failed TopUp Test",
          email: `po-clear-topup-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: "TTestAddressForClearFailedTopUp123456",
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
          step: PurchaseOrderStep.validate,
          topUpTxId: "failed-topup-txid-abc",
          topUpTxIds: [],
        },
      });

      const cleared = await clearFailedTopUpTxRecord(order);
      assert.equal(cleared.topUpTxId, null);
      assert.deepEqual(cleared.topUpTxIds, ["failed-topup-txid-abc"]);
      assert.equal(cleared.step, PurchaseOrderStep.trx_topup);

      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
