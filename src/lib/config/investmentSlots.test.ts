import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PurchaseOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getEffectiveSlotsPerFund,
  getPlayerLevelPerks,
} from "./playerLevels";
import {
  countUnrepresentedActiveOrders,
  getInvestmentSlotUsage,
  getMaxOpenInvestmentsForFund,
  InvestmentSlotsFullError,
  TotalInvestmentsCapError,
} from "./investmentSlots";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("investment slot helpers", () => {
  it("excludes the in-flight purchase order when materializing its investment", () => {
    const linked = new Set(["order-linked"]);
    assert.equal(
      countUnrepresentedActiveOrders(
        ["order-current", "order-linked"],
        linked
      ),
      1
    );
    assert.equal(
      countUnrepresentedActiveOrders(
        ["order-current", "order-linked"],
        linked,
        { excludingPurchaseOrderId: "order-current" }
      ),
      0
    );
  });

  it("returns per-fund maxOpenInvestments from catalog", () => {
    assert.equal(getMaxOpenInvestmentsForFund("aggressive-alpha"), 5);
    assert.equal(getMaxOpenInvestmentsForFund("capital-shield"), 5);
  });

  it("falls back to 1 for unknown funds", () => {
    assert.equal(getMaxOpenInvestmentsForFund("unknown-fund"), 1);
  });

  it("InvestmentSlotsFullError exposes code and counts", () => {
    const err = new InvestmentSlotsFullError(5, 5);
    assert.equal(err.code, "SLOTS_FULL");
    assert.equal(err.openCount, 5);
    assert.equal(err.maxOpenInvestments, 5);
    assert.match(err.message, /5\/5/);
  });

  it("TotalInvestmentsCapError exposes code and counts", () => {
    const err = new TotalInvestmentsCapError(3, 3);
    assert.equal(err.code, "TOTAL_INVESTMENTS_CAP");
    assert.equal(err.totalOpenCount, 3);
    assert.equal(err.maxTotalOpenInvestments, 3);
  });

  it("level 0 caps per-fund slots at 1", () => {
    assert.equal(getEffectiveSlotsPerFund(0, 5), 1);
    assert.equal(getPlayerLevelPerks(0).maxTotalOpenInvestments, 3);
  });

  it(
    "counts active purchase orders toward used slots",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Slot Usage Test",
          email: `slot-usage-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TSlotUsageTest${Date.now()}`,
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });

      const fundId = "aggressive-alpha";
      await prisma.purchaseOrder.create({
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

      const usage = await getInvestmentSlotUsage(user.id, fundId);
      assert.equal(usage.openCount, 1);
      assert.equal(usage.maxOpenInvestments, 1);
      assert.equal(usage.slotsAvailable, 0);

      await prisma.purchaseOrder.deleteMany({ where: { userId: user.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
