import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import {
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  PurchaseOrderStep,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { healPurchaseOrderFromChainTruth } from "./purchaseOrderProcessor";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("healPurchaseOrderFromChainTruth manual guard", () => {
  it(
    "returns false without completing manual fulfillment orders",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Manual Heal Guard Test",
          email: `manual-heal-guard-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: "TTestAddressManualHealGuard123456",
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
          step: PurchaseOrderStep.awaiting_review,
          fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
          usdtTxId: "48cd69c2ac60401dc1801a910f60e9406d9985dffabb75305afd04e695d43c1e",
          adminUsdtTxId:
            "48cd69c2ac60401dc1801a910f60e9406d9985dffabb75305afd04e695d43c1e",
        },
      });

      const healed = await healPurchaseOrderFromChainTruth(order);
      assert.equal(healed, false);

      const fresh = await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: order.id },
      });
      assert.equal(fresh.status, PurchaseOrderStatus.processing);
      assert.equal(fresh.investmentId, null);

      await prisma.purchaseOrder.delete({ where: { id: order.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
