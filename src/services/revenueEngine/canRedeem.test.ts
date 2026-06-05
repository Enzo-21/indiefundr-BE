import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetEnvCache } from "@/lib/env";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";
import { canRedeem } from "./canRedeem";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("canRedeem", () => {
  it(
    "returns not_matured for active investment",
    { skip: skipDbTests },
    async () => {
      const original = process.env.REVENUE_ENGINE_ENABLED;
      process.env.REVENUE_ENGINE_ENABLED = "true";
      resetEnvCache();

      const { InvestmentStatus } = await import("@prisma/client");
      const { prisma } = await import("@/lib/prisma");

      const user = await prisma.user.create({
        data: {
          name: "Redeem Test",
          email: `redeem-${Date.now()}@example.com`,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          address: `TRedeem${Date.now()}`,
          privateKey: "pk-test",
        },
      });
      const investment = await prisma.investment.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "balanced-growth",
          amountUsdt: 25,
          returnPercent90d: 25,
          projectedPayoutUsdt: 31.25,
          status: InvestmentStatus.active,
        },
      });

      const result = await canRedeem(investment.id);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, "not_matured");
      }

      await prisma.investment.delete({ where: { id: investment.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });

      process.env.REVENUE_ENGINE_ENABLED = original;
      resetEnvCache();
    }
  );

  it("returns ok when revenue engine disabled", async () => {
    const original = process.env.REVENUE_ENGINE_ENABLED;
    process.env.REVENUE_ENGINE_ENABLED = "false";
    resetEnvCache();

    const result = await canRedeem("507f1f77bcf86cd799439099");
    assert.equal(result.ok, true);

    process.env.REVENUE_ENGINE_ENABLED = original;
    resetEnvCache();
  });
});
