import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvestmentPayabilityStatus, InvestmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fieldIsNullOrUnset } from "@/lib/prisma/mongoFieldFilters";
import {
  applyUnpaidMaturityChoice,
  getPendingUnpaidMaturityChoiceForUser,
} from "./unpaidMaturityChoice";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("unpaid maturity choice Mongo filters", () => {
  it(
    "claims choice when unpaidMaturityResolution is unset on the document",
    { skip: !hasDatabase },
    async () => {
      const now = new Date();
      const choiceDeadlineAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const user = await prisma.user.create({
        data: {
          name: "Unpaid Choice Mongo Test",
          email: `unpaid-choice-mongo-${Date.now()}@example.com`,
          level: 4,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TUnpaidChoiceMongo${Date.now()}`,
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
          returnPercent90d: 40,
          projectedPayoutUsdt: 35,
          status: InvestmentStatus.matured,
          subscribedAt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          maturesAt: new Date(now.getTime() - 60_000),
          payabilityStatus: InvestmentPayabilityStatus.pending_liquidity,
          unpaidMaturityChoiceDeadlineAt: choiceDeadlineAt,
        },
      });

      try {
        const legacyMatch = await prisma.investment.count({
          where: { id: investment.id, unpaidMaturityResolution: null },
        });
        const unsetMatch = await prisma.investment.count({
          where: { AND: [{ id: investment.id }, fieldIsNullOrUnset("unpaidMaturityResolution")] },
        });

        assert.equal(legacyMatch, 0);
        assert.equal(unsetMatch, 1);

        const pending = await getPendingUnpaidMaturityChoiceForUser(user.id, user.level ?? 4);
        assert.ok(pending);
        assert.equal(pending?.investmentId, investment.id);

        const result = await applyUnpaidMaturityChoice(
          user.id,
          investment.id,
          "referral_recovery"
        );
        assert.equal(result.ok, true);

        const updated = await prisma.investment.findUnique({
          where: { id: investment.id },
          select: { unpaidMaturityResolution: true, recoveryEligibleAt: true },
        });
        assert.equal(updated?.unpaidMaturityResolution, "referral_recovery");
        assert.ok(updated?.recoveryEligibleAt);
      } finally {
        await prisma.playerPowerUse.deleteMany({ where: { userId: user.id } });
        await prisma.investment.delete({ where: { id: investment.id } });
        await prisma.wallet.delete({ where: { id: wallet.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
  );
});
