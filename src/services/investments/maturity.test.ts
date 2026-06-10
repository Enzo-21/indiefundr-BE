import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvestmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { markMaturedInvestments } from "./maturity";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("markMaturedInvestments", () => {
  it(
    "respects limit and returns pendingCount for remaining overdue rows",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Maturity Batch Test",
          email: `maturity-batch-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TMaturityBatch${Date.now()}`,
          privateKey: "test-private-key",
          isMainWallet: true,
        },
      });

      const fundId = "aggressive-alpha";
      const past = new Date(Date.now() - 60_000);

      for (let i = 0; i < 3; i++) {
        await prisma.investment.create({
          data: {
            userId: user.id,
            walletId: wallet.id,
            fundId,
            amountUsdt: 25,
            returnPercent90d: 40,
            projectedPayoutUsdt: 35,
            status: InvestmentStatus.active,
            subscribedAt: new Date(past.getTime() - i * 1000),
            maturesAt: new Date(past.getTime() - i * 1000),
          },
        });
      }

      const firstBatch = await markMaturedInvestments({ limit: 2 });
      assert.equal(firstBatch.count, 2);
      assert.equal(firstBatch.pendingCount, 1);
      assert.equal(firstBatch.matured.length, 2);

      const secondBatch = await markMaturedInvestments({ limit: 2 });
      assert.equal(secondBatch.count, 1);
      assert.equal(secondBatch.pendingCount, 0);

      const thirdBatch = await markMaturedInvestments({ limit: 2 });
      assert.equal(thirdBatch.count, 0);
      assert.equal(thirdBatch.pendingCount, 0);

      await prisma.investment.deleteMany({ where: { userId: user.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
