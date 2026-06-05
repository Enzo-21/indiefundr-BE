import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentStatus,
  PurchaseOrderStatus,
  PurchaseOrderStep,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAppTransactions } from "./walletTransactions";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("buildAppTransactions", () => {
  it(
    "hides failed purchase orders when a later successful investment exists for the same fund",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Wallet Activity Filter User",
          email: `wallet-activity-filter-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TWalletActivity${Date.now()}`,
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });

      const failedOrder = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth",
          costUsdt: 50,
          reservedUsdt: 50,
          status: PurchaseOrderStatus.failed,
          step: PurchaseOrderStep.topup,
          failureReason: "Fee sponsorship timed out",
          topUpTxId: "mock-topup-fee-tx",
        },
      });

      await prisma.investment.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth",
          amountUsdt: 50,
          returnPercent90d: 10,
          projectedPayoutUsdt: 55,
          status: InvestmentStatus.active,
          date: new Date(failedOrder.updatedAt.getTime() + 30_000),
        },
      });

      const transactions = await buildAppTransactions(user.id, wallet.id);
      const failedRows = transactions.filter(
        (tx) =>
          tx.status === "failed" &&
          tx.label.toLowerCase().startsWith("failed investment order")
      );
      assert.equal(failedRows.length, 0);

      await prisma.investment.deleteMany({ where: { userId: user.id } });
      await prisma.purchaseOrder.deleteMany({ where: { userId: user.id } });
      await prisma.wallet.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "keeps failed purchase orders when there is no later successful investment",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Wallet Activity Keep Failed User",
          email: `wallet-activity-keep-failed-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TWalletActivityKeep${Date.now()}`,
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });

      await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth",
          costUsdt: 75,
          reservedUsdt: 75,
          status: PurchaseOrderStatus.failed,
          step: PurchaseOrderStep.topup,
          failureReason: "Fee sponsorship timed out",
          topUpTxId: "mock-topup-fee-tx-2",
        },
      });

      const transactions = await buildAppTransactions(user.id, wallet.id);
      const failedRows = transactions.filter(
        (tx) =>
          tx.status === "failed" &&
          tx.label.toLowerCase().startsWith("failed investment order")
      );
      assert.equal(failedRows.length, 1);

      await prisma.purchaseOrder.deleteMany({ where: { userId: user.id } });
      await prisma.wallet.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "hides retry-pending failed purchase orders from user activity",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Wallet Activity Retry Pending User",
          email: `wallet-activity-retry-pending-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TWalletActivityRetryPending${Date.now()}`,
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });

      await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth",
          costUsdt: 75,
          reservedUsdt: 75,
          status: PurchaseOrderStatus.failed,
          step: PurchaseOrderStep.done,
          failureReason: "retry_pending:TRX top-up failed on-chain",
          sponsoredTrx: 2,
          sweepTxId: "mock-sweep-recovery-tx",
        },
      });

      const transactions = await buildAppTransactions(user.id, wallet.id);
      const retryPendingRows = transactions.filter(
        (tx) => tx.id.startsWith("purchase-order-") && tx.status === "failed"
      );
      assert.equal(retryPendingRows.length, 0);

      await prisma.purchaseOrder.deleteMany({ where: { userId: user.id } });
      await prisma.wallet.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "shows one failed row when FailedInvestment matches failed PurchaseOrder",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Wallet Activity Dedupe User",
          email: `wallet-activity-dedupe-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TWalletActivityDedupe${Date.now()}`,
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });

      const failedAt = new Date();

      await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "aggressive-alpha",
          costUsdt: 25,
          reservedUsdt: 25,
          status: PurchaseOrderStatus.failed,
          step: PurchaseOrderStep.done,
          failureReason: "REVERT opcode executed",
          date: failedAt,
          updatedAt: failedAt,
        },
      });

      await prisma.failedInvestment.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "aggressive-alpha",
          amountUsdt: 25,
          date: failedAt,
        },
      });

      const transactions = await buildAppTransactions(user.id, wallet.id);
      const failedRows = transactions.filter(
        (tx) =>
          tx.status === "failed" &&
          tx.label.toLowerCase().startsWith("failed investment order")
      );
      assert.equal(failedRows.length, 1);
      assert.equal(failedRows[0]?.id.startsWith("purchase-order-"), true);
      assert.match(failedRows[0]?.detail ?? "", /REVERT/);

      await prisma.failedInvestment.deleteMany({ where: { userId: user.id } });
      await prisma.purchaseOrder.deleteMany({ where: { userId: user.id } });
      await prisma.wallet.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
