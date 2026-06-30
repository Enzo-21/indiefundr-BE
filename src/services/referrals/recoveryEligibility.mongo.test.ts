import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  UnpaidMaturityResolution,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fieldIsNullOrUnset } from "@/lib/prisma/mongoFieldFilters";
import { getRecoveryContextForInviter } from "./recoveryEligibility";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("recovery eligibility Mongo filters", () => {
  it(
    "finds recovery-in-progress when referralRecoveryCompletedAt is unset",
    { skip: !hasDatabase },
    async () => {
      const now = new Date();
      const user = await prisma.user.create({
        data: {
          name: "Recovery Mongo Test",
          email: `recovery-mongo-${Date.now()}@example.com`,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TRecoveryMongo${Date.now()}`,
          privateKey: "test-private-key",
          isMainWallet: true,
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
          status: InvestmentStatus.matured,
          subscribedAt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          maturesAt: new Date(now.getTime() - 60_000),
          payabilityStatus: InvestmentPayabilityStatus.pending_liquidity,
          recoveryEligibleAt: now,
          unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery,
        },
      });

      try {
        const legacyMatch = await prisma.investment.count({
          where: {
            id: investment.id,
            referralRecoveryCompletedAt: null,
          },
        });
        const unsetMatch = await prisma.investment.count({
          where: {
            AND: [{ id: investment.id }, fieldIsNullOrUnset("referralRecoveryCompletedAt")],
          },
        });

        assert.equal(legacyMatch, 0);
        assert.equal(unsetMatch, 1);

        const ctx = await getRecoveryContextForInviter(user.id);
        assert.equal(ctx.mode, "recovery");
        assert.equal(ctx.recovery?.investmentId, investment.id);
      } finally {
        await prisma.investment.delete({ where: { id: investment.id } });
        await prisma.wallet.delete({ where: { id: wallet.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
  );
});
