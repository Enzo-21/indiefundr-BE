import assert from "node:assert/strict";
import { describe, it, mock, after } from "node:test";
import {
  InvestmentStatus,
  PurchaseOrderStatus,
  PurchaseOrderStep,
  type PurchaseOrder,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

const MOCK_SUCCESS_TX = "mock-usdt-success-tx";

function isMockSuccessTx(txId: string | null | undefined): boolean {
  return (
    txId === MOCK_SUCCESS_TX ||
    (typeof txId === "string" && txId.startsWith("mock-batch-success-"))
  );
}

function mockChainTruthForSuccessfulUsdt() {
  mock.module("@/services/tron/usdtPaymentChainTruth", {
    namedExports: {
      resolveOrderPaymentOnChain: async (order: PurchaseOrder) => {
        const ids = [order.usdtTxId, ...(order.failedUsdtTxIds ?? [])].filter(
          Boolean
        ) as string[];
        const winning = ids.find((id) => isMockSuccessTx(id));
        if (winning) {
          return { outcome: "success" as const, winningTxId: winning };
        }
        return { outcome: "failed" as const };
      },
      buildFundPaymentContext: (
        order: PurchaseOrder,
        treasuryAddress: string
      ) => ({
        treasuryAddress,
        expectedAmountUsdt: order.costUsdt,
      }),
      collectPaymentTxIds: async (order: PurchaseOrder) =>
        [order.usdtTxId, ...(order.failedUsdtTxIds ?? [])].filter(
          Boolean
        ) as string[],
      collectPaymentTxIdsFromOrder: (order: PurchaseOrder) =>
        [order.usdtTxId, ...(order.failedUsdtTxIds ?? [])].filter(
          Boolean
        ) as string[],
      orderNeedsOnChainSettlement: async () => false,
      resolvePaymentFromTxIds: async (txIds: string[]) => {
        const winning = txIds.find((id) => isMockSuccessTx(id));
        if (winning) {
          return { outcome: "success" as const, winningTxId: winning };
        }
        return { outcome: "failed" as const };
      },
      inspectUsdtPaymentTx: async (txId: string) => ({
        txId,
        transactionInfo: null,
        transaction: null,
        status: "success" as const,
        usdtTransferSuccessful: isMockSuccessTx(txId),
      }),
    },
  });
}

describe("purchaseOrder on-chain reconcile", () => {
  after(() => {
    mock.restoreAll();
  });

  it(
    "finalizePurchaseOrderIfUsdtSucceededOnChain completes processing order when USDT succeeded on-chain",
    { skip: skipDbTests },
    async () => {
      mock.restoreAll();
      mockChainTruthForSuccessfulUsdt();

      const { finalizePurchaseOrderIfUsdtSucceededOnChain: finalize } =
        await import("./purchaseOrderProcessor");

      const user = await prisma.user.create({
        data: {
          name: "Reconcile Processing Test",
          email: `reconcile-processing-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: "TReconcileProcessingTestWalletAddr123",
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
          usdtTxId: MOCK_SUCCESS_TX,
          investmentId: investment.id,
        },
      });

      const finalized = await finalize(order);
      assert.equal(finalized, true);

      const updatedOrder = await prisma.purchaseOrder.findUnique({
        where: { id: order.id },
      });
      assert.equal(updatedOrder?.status, PurchaseOrderStatus.completed);

      const updatedInvestment = await prisma.investment.findUnique({
        where: { id: investment.id },
      });
      assert.equal(updatedInvestment?.status, InvestmentStatus.active);

      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.investment.delete({ where: { id: investment.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "finalizePurchaseOrderIfUsdtSucceededOnChain heals failed order when USDT succeeded on-chain",
    { skip: skipDbTests },
    async () => {
      mock.restoreAll();
      mockChainTruthForSuccessfulUsdt();

      const { finalizePurchaseOrderIfUsdtSucceededOnChain: finalize } =
        await import("./purchaseOrderProcessor");

      const user = await prisma.user.create({
        data: {
          name: "Reconcile Failed Test",
          email: `reconcile-failed-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: "TReconcileFailedTestWalletAddress1234",
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
          status: PurchaseOrderStatus.failed,
          step: PurchaseOrderStep.done,
          failureReason: "REVERT opcode executed",
          usdtTxId: MOCK_SUCCESS_TX,
          investmentId: investment.id,
        },
      });

      const finalized = await finalize(order);
      assert.equal(finalized, true);

      const updatedOrder = await prisma.purchaseOrder.findUnique({
        where: { id: order.id },
      });
      assert.equal(updatedOrder?.status, PurchaseOrderStatus.completed);

      const updatedInvestment = await prisma.investment.findUnique({
        where: { id: investment.id },
      });
      assert.equal(updatedInvestment?.status, InvestmentStatus.active);

      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.investment.delete({ where: { id: investment.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "reconcileFailedOrdersWithUsdtTx heals multiple failed orders across rounds",
    { skip: skipDbTests },
    async () => {
      mock.restoreAll();
      mockChainTruthForSuccessfulUsdt();

      const { reconcileFailedOrdersWithUsdtTx } = await import(
        "./purchaseOrderProcessor"
      );

      const user = await prisma.user.create({
        data: {
          name: "Reconcile Batch Test",
          email: `reconcile-batch-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TReconcileBatch${Date.now()}`,
          privateKey: "test-private-key",
        },
      });

      const orderIds: string[] = [];
      for (let i = 0; i < 2; i++) {
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
            status: PurchaseOrderStatus.failed,
            step: PurchaseOrderStep.done,
            failureReason: "REVERT opcode executed",
            usdtTxId: `mock-batch-success-${i}-${Date.now()}`,
            investmentId: investment.id,
          },
        });
        orderIds.push(order.id);
      }

      const reconciled = await reconcileFailedOrdersWithUsdtTx({
        limit: 1,
        maxRounds: 5,
      });
      assert.equal(reconciled, 2);

      const orders = await prisma.purchaseOrder.findMany({
        where: { id: { in: orderIds } },
      });
      assert.equal(
        orders.every((row) => row.status === PurchaseOrderStatus.completed),
        true
      );

      await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.investment.deleteMany({ where: { userId: user.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it("finalizePurchaseOrderIfUsdtSucceededOnChain returns false without usdtTxId", async () => {
    const { finalizePurchaseOrderIfUsdtSucceededOnChain } = await import(
      "./purchaseOrderProcessor"
    );
    const order = {
      id: "order-no-tx",
      usdtTxId: null,
      status: PurchaseOrderStatus.processing,
    } as PurchaseOrder;

    const result = await finalizePurchaseOrderIfUsdtSucceededOnChain(order);
    assert.equal(result, false);
  });
});
