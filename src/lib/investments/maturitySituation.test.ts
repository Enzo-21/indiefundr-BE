import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ForfeitureReason,
  InvestmentPayabilityStatus,
  InvestmentStatus,
  UnpaidMaturityResolution,
} from "@prisma/client";
import { resolveMaturitySituation } from "./maturitySituation";

const choiceDeadline = new Date("2099-06-05T12:00:00.000Z");
const choiceNow = new Date("2099-06-03T12:00:00.000Z");

const maturedBase = {
  id: "inv-matured-base",
  status: InvestmentStatus.matured,
  payabilityStatus: InvestmentPayabilityStatus.pending_liquidity,
  payoutUnlockedAt: null,
  recoveryEligibleAt: null,
  referralRecoveryCompletedAt: null,
  unpaidMaturityResolution: null,
  unpaidMaturityChoiceDeadlineAt: choiceDeadline,
  termExtensionDays: null,
  maturesAt: new Date("2026-04-01T00:00:00.000Z"),
  globalQueueRank: null,
  newSubscribersNeeded: null,
  forfeitureReason: null,
  forfeitedAt: null,
  projectedPayoutUsdt: 30,
  amountUsdt: 25,
  subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("resolveMaturitySituation", () => {
  it("returns choice_required when FIFO-unpaid choice is pending", () => {
    const view = resolveMaturitySituation(maturedBase, {
      fifoEligibleIds: new Set(),
      now: choiceNow,
    });
    assert.equal(view.situation, "choice_required");
    assert.equal(view.statusLabel, "Choose next step");
    assert.equal(view.needsUnpaidMaturityChoice, true);
    assert.equal(view.nextDeadlineLabel, "Choice deadline");
  });

  it("returns extended_active after term extension", () => {
    const extendedMatures = new Date("2099-08-01T00:00:00.000Z");
    const view = resolveMaturitySituation(
      {
        ...maturedBase,
        status: InvestmentStatus.active,
        unpaidMaturityResolution: UnpaidMaturityResolution.term_extension,
        termExtensionDays: 14,
        maturesAt: extendedMatures,
        unpaidMaturityChoiceDeadlineAt: null,
      },
      { now: choiceNow }
    );
    assert.equal(view.situation, "extended_active");
    assert.equal(view.chosenPath, "term_extension");
    assert.equal(view.nextDeadlineAt, extendedMatures.toISOString());
    assert.match(view.statusDetail, /14 more days/);
  });

  it("returns recovery_in_progress after invite path chosen", () => {
    const recoveryAt = new Date("2099-06-01T00:00:00.000Z");
    const view = resolveMaturitySituation(
      {
        ...maturedBase,
        unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery,
        recoveryEligibleAt: recoveryAt,
        unpaidMaturityChoiceDeadlineAt: null,
      },
      {
        fifoEligibleIds: new Set(),
        recoveryQualifiedCount: 1,
        recoveryRequiredCount: 2,
        now: choiceNow,
      }
    );
    assert.equal(view.situation, "recovery_in_progress");
    assert.equal(view.chosenPath, "referral_recovery");
    assert.match(view.statusDetail, /1 of 2/);
  });

  it("returns waiting_liquidity with queue rank", () => {
    const view = resolveMaturitySituation(
      {
        ...maturedBase,
        unpaidMaturityChoiceDeadlineAt: null,
        globalQueueRank: 3,
        newSubscribersNeeded: 2,
      },
      { fifoEligibleIds: new Set(), now: choiceNow }
    );
    assert.equal(view.situation, "waiting_liquidity");
    assert.equal(view.statusLabel, "Payout queue #3");
    assert.equal(view.newSubscribersNeeded, 2);
  });

  it("returns awaiting_admin_payout when unlocked", () => {
    const view = resolveMaturitySituation(
      {
        ...maturedBase,
        payoutUnlockedAt: new Date(),
        payabilityStatus: InvestmentPayabilityStatus.payable,
        unpaidMaturityChoiceDeadlineAt: null,
      },
      { now: choiceNow }
    );
    assert.equal(view.situation, "awaiting_admin_payout");
    assert.equal(view.statusLabel, "Awaiting admin payout");
  });

  it("returns waiting_unlock when matured without queue or choice", () => {
    const view = resolveMaturitySituation(
      {
        ...maturedBase,
        unpaidMaturityChoiceDeadlineAt: null,
      },
      { fifoEligibleIds: new Set(), now: choiceNow }
    );
    assert.equal(view.situation, "waiting_unlock");
    assert.match(view.statusDetail, /waiting on pool activity/);
    assert.doesNotMatch(view.statusDetail, /2×/);
  });

  it("returns forfeited labels by reason", () => {
    const view = resolveMaturitySituation(
      {
        ...maturedBase,
        status: InvestmentStatus.forfeited,
        forfeitureReason: ForfeitureReason.choice_deadline_expired,
      },
      { now: choiceNow }
    );
    assert.equal(view.situation, "forfeited");
    assert.equal(view.statusLabel, "Term ended — no choice made");
  });
});
