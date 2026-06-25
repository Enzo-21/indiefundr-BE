import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ForfeitureReason,
  InvestmentStatus,
  UnpaidMaturityResolution,
} from "@prisma/client";
import { getUserStatusLabel } from "@/lib/investments/presentation";
import {
  isReferralRecoveryEligible,
  isRecoveryCandidate,
} from "@/services/referrals/recoveryEligibility";
import {
  getUnpaidMaturityChoiceContext,
  isUnpaidMaturityChoicePending,
} from "@/services/investments/unpaidMaturityChoice";
import { buildPowerInventory } from "@/services/playerPowers/playerPowers";

const fullPowers = buildPowerInventory(4, {});
const emptyPowers = buildPowerInventory(4, {
  referral_recovery: 15,
  term_extension: 14,
});

const choiceDeadlineAt = new Date("2099-06-05T12:00:00.000Z");
const choiceNow = new Date("2099-06-03T12:00:00.000Z");
const expiredChoiceNow = new Date("2099-06-10T00:00:00.000Z");

const baseInvestment = {
  id: "inv-1",
  status: InvestmentStatus.matured,
  payoutUnlockedAt: null,
  referralRecoveryCompletedAt: null,
  unpaidMaturityResolution: null,
  unpaidMaturityChoiceDeadlineAt: choiceDeadlineAt,
  subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
  projectedPayoutUsdt: 30,
  maturesAt: new Date("2026-04-01T00:00:00.000Z"),
  fundId: "balanced-growth",
  amountUsdt: 25,
};

describe("unpaid maturity choice eligibility", () => {
  it("flags pending choice for unpaid matured investments", () => {
    const fifo = new Set<string>();
    const now = new Date("2026-06-03T12:00:00.000Z");
    assert.equal(isRecoveryCandidate(baseInvestment, fifo), true);
    assert.equal(isUnpaidMaturityChoicePending(baseInvestment, fifo, now), true);
  });

  it("does not offer choice after the 48-hour deadline", () => {
    const fifo = new Set<string>();
    assert.equal(
      isUnpaidMaturityChoicePending(baseInvestment, fifo, expiredChoiceNow),
      false
    );
  });

  it("does not offer choice when FIFO-eligible", () => {
    const fifo = new Set<string>(["inv-1"]);
    assert.equal(isUnpaidMaturityChoicePending(baseInvestment, fifo), false);
  });

  it("does not offer choice after resolution", () => {
    const fifo = new Set<string>();
    const resolved = {
      ...baseInvestment,
      unpaidMaturityResolution: UnpaidMaturityResolution.term_extension,
    };
    assert.equal(isUnpaidMaturityChoicePending(resolved, fifo), false);
  });

  it("exposes extension bounds in choice context", () => {
    assert.equal(
      isUnpaidMaturityChoicePending(baseInvestment, new Set(), choiceNow),
      true
    );
    const ctx = getUnpaidMaturityChoiceContext(
      baseInvestment,
      new Set(),
      fullPowers
    );
    assert.ok(ctx);
    assert.equal(ctx?.extensionMinDays, 7);
    assert.ok((ctx?.extensionMaxDays ?? 0) >= 7);
    assert.equal(ctx?.needsChoice, true);
    assert.equal(ctx?.choiceDeadlineAt, choiceDeadlineAt.toISOString());
    assert.equal(ctx?.canChooseReferralRecovery, true);
    assert.equal(ctx?.canChooseTermExtension, true);
  });

  it("marks choice paths unavailable when power cards are depleted", () => {
    const ctx = getUnpaidMaturityChoiceContext(
      baseInvestment,
      new Set(),
      emptyPowers
    );
    assert.ok(ctx);
    assert.equal(ctx?.canChooseReferralRecovery, false);
    assert.equal(ctx?.canChooseTermExtension, false);
  });

  it("blocks referral recovery until user chooses recover path", () => {
    const fifo = new Set<string>();
    const now = new Date("2026-06-03T12:00:00.000Z");
    const recoveryEligibleAt = new Date("2026-06-03T10:00:00.000Z");
    const withRecoveryAt = {
      ...baseInvestment,
      recoveryEligibleAt,
    };
    assert.equal(isReferralRecoveryEligible(withRecoveryAt, fifo, now), false);

    const afterChoice = {
      ...withRecoveryAt,
      unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery,
    };
    assert.equal(isReferralRecoveryEligible(afterChoice, fifo, now), true);
  });

  it("never allows referral recovery after term extension", () => {
    const fifo = new Set<string>();
    const extended = {
      ...baseInvestment,
      unpaidMaturityResolution: UnpaidMaturityResolution.term_extension,
      recoveryEligibleAt: new Date("2026-06-01T00:00:00.000Z"),
    };
    assert.equal(isReferralRecoveryEligible(extended, fifo), false);
  });
});

describe("unpaid maturity presentation labels", () => {
  it("shows choose-next-step while choice is pending", () => {
    const label = getUserStatusLabel(baseInvestment as any, {
      needsUnpaidMaturityChoice: true,
    });
    assert.equal(label, "Choose next step");
  });

  it("shows extended active label after term extension choice", () => {
    const label = getUserStatusLabel({
      ...baseInvestment,
      status: InvestmentStatus.active,
      unpaidMaturityResolution: UnpaidMaturityResolution.term_extension,
    } as any);
    assert.equal(label, "Extended — waiting");
  });

  it("shows forfeited label after second unpaid maturity", () => {
    const label = getUserStatusLabel({
      ...baseInvestment,
      status: InvestmentStatus.forfeited,
      unpaidMaturityResolution: UnpaidMaturityResolution.term_extension,
      forfeitureReason: ForfeitureReason.second_maturity_unpaid,
    } as any);
    assert.equal(label, "Term ended — fund unpaid");
  });

  it("shows forfeited label when choice deadline expires", () => {
    const label = getUserStatusLabel({
      ...baseInvestment,
      status: InvestmentStatus.forfeited,
      forfeitureReason: ForfeitureReason.choice_deadline_expired,
    } as any);
    assert.equal(label, "Term ended — no choice made");
  });
});
