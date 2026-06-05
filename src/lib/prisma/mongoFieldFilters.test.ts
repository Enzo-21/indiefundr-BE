import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PurchaseOrderStatus, PurchaseOrderStep } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fieldIsNullOrUnset } from "./mongoFieldFilters";

describe("mongoFieldFilters", () => {
  it("fieldIsNullOrUnset matches purchase orders with omitted topUpTxId", async () => {
    const user = await prisma.user.findFirst();
    const wallet = user
      ? await prisma.wallet.findFirst({ where: { userId: user.id } })
      : null;
    if (!user || !wallet) {
      console.log("skip: no user/wallet in database");
      return;
    }

    const order = await prisma.purchaseOrder.create({
      data: {
        userId: user.id,
        walletId: wallet.id,
        fundId: "aggressive-alpha",
        costUsdt: 1,
        reservedUsdt: 1,
        status: PurchaseOrderStatus.processing,
        step: PurchaseOrderStep.validate,
      },
    });

    try {
      const legacyMatch = await prisma.purchaseOrder.count({
        where: { id: order.id, topUpTxId: null },
      });
      const unsetMatch = await prisma.purchaseOrder.count({
        where: { AND: [{ id: order.id }, fieldIsNullOrUnset("topUpTxId")] },
      });

      assert.equal(legacyMatch, 0);
      assert.equal(unsetMatch, 1);
    } finally {
      await prisma.purchaseOrder.delete({ where: { id: order.id } });
    }
  });
});
