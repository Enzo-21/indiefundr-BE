import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import {
  InvestmentStatus,
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  PurchaseOrderStep,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { markAdminPurchaseOrderSuccess } from "./purchaseOrderFulfillment";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("markAdminPurchaseOrderSuccess", () => {
  it(
    "is idempotent when order is already completed",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Admin Mark Success Idempotent",
          email: `admin-mark-idempotent-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: "TTestAddressAdminMarkIdempotent12",
          privateKey: "test-private-key",
        },
      });

      const investment = await prisma.investment.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth",
          amountUsdt: 25,
          status: InvestmentStatus.active,
        },
      });

      const order = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth",
          costUsdt: 25,
          reservedUsdt: 0,
          status: PurchaseOrderStatus.completed,
          step: PurchaseOrderStep.done,
          fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
          usdtTxId: "abc123usdtcompletedmanualorder",
          adminUsdtTxId: "abc123usdtcompletedmanualorder",
          investmentId: investment.id,
          adminSettledBy: "admin@test.com",
          adminSettledAt: new Date(),
        },
      });

      await assert.doesNotReject(() =>
        markAdminPurchaseOrderSuccess(order.id, "admin@test.com")
      );

      const fresh = await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      assert.equal(fresh.status, PurchaseOrderStatus.completed);
      assert.equal(fresh.investmentId, investment.id);

      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.investment.delete({ where: { id: investment.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
