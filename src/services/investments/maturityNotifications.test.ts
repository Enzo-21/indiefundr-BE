import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvestmentStatus } from "@prisma/client";
import {
  needsUnpaidMaturityChoiceFromInvestment,
  notifyMaturedInvestments,
} from "./maturityNotifications";

describe("needsUnpaidMaturityChoiceFromInvestment", () => {
  const now = new Date("2026-06-20T12:00:00.000Z");
  const deadline = new Date("2026-06-22T12:00:00.000Z");

  const maturedBase = {
    id: "inv-1",
    status: InvestmentStatus.matured,
    unpaidMaturityChoiceDeadlineAt: deadline,
    unpaidMaturityResolution: null,
    payoutUnlockedAt: null,
    referralRecoveryCompletedAt: null,
    subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
    projectedPayoutUsdt: 31.25,
    maturesAt: new Date("2026-06-01T00:00:00.000Z"),
  };

  it("is true for matured investments with an active choice deadline", () => {
    assert.equal(
      needsUnpaidMaturityChoiceFromInvestment(maturedBase, new Set(), now),
      true
    );
  });

  it("is false after the choice deadline expires", () => {
    assert.equal(
      needsUnpaidMaturityChoiceFromInvestment(
        {
          ...maturedBase,
          unpaidMaturityChoiceDeadlineAt: new Date("2026-06-19T12:00:00.000Z"),
        },
        new Set(),
        now
      ),
      false
    );
  });

  it("is false once payout is unlocked or choice resolved", () => {
    assert.equal(
      needsUnpaidMaturityChoiceFromInvestment(
        {
          ...maturedBase,
          payoutUnlockedAt: new Date(),
        },
        new Set(),
        now
      ),
      false
    );
  });
});

describe("notifyMaturedInvestments", () => {
  it("returns zero counts for an empty list", async () => {
    const result = await notifyMaturedInvestments([]);
    assert.deepEqual(result, { notifiedCount: 0, skippedNoDevice: 0 });
  });
});
