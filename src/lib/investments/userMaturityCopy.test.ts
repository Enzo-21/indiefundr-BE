import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ForfeitureReason,
  InvestmentPayabilityStatus,
  InvestmentStatus,
} from "@prisma/client";
import { resolveMaturitySituation } from "./maturitySituation";
import {
  toUserFacingMaturityCopy,
  userForfeitureDetail,
  userMaturedWaitingEmailBody,
  userRedeemedPayoutDetail,
} from "./userMaturityCopy";

const choiceDeadline = new Date("2099-06-05T12:00:00.000Z");
const choiceNow = new Date("2099-06-03T12:00:00.000Z");

const maturedBase = {
  id: "inv-matured-base",
  status: InvestmentStatus.matured,
  payabilityStatus: InvestmentPayabilityStatus.pending_liquidity,
  payoutUnlockedAt: null,
  payoutReason: null,
  recoveryEligibleAt: null,
  referralRecoveryCompletedAt: null,
  boostActivatedAt: null,
  boostCompletedAt: null,
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

function assertNoInternalInfraTerms(text: string) {
  assert.doesNotMatch(text, /\bpool\b/i);
  assert.doesNotMatch(text, /\bliquidity\b/i);
  assert.doesNotMatch(text, /queue processing/i);
  assert.doesNotMatch(text, /treasury operations/i);
}

describe("userMaturityCopy", () => {
  it("maps choice_required to marketing copy", () => {
    const internal = resolveMaturitySituation(maturedBase, {
      fifoEligibleIds: new Set(),
      now: choiceNow,
    });
    const user = toUserFacingMaturityCopy(internal);
    assert.equal(user.statusLabel, "Choose next step");
    assert.match(user.statusDetail, /projected payout isn't ready yet/);
    assert.match(user.statusDetail, /invite 2 friends/);
    assertNoInternalInfraTerms(`${user.statusLabel} ${user.statusDetail}`);
  });

  it("maps waiting_liquidity to in-line payout copy", () => {
    const internal = resolveMaturitySituation(
      {
        ...maturedBase,
        unpaidMaturityChoiceDeadlineAt: null,
        globalQueueRank: 3,
      },
      { fifoEligibleIds: new Set(), now: choiceNow }
    );
    const user = toUserFacingMaturityCopy(internal);
    assert.equal(user.statusLabel, "Payout in progress (#3)");
    assert.match(user.statusDetail, /#3 in line/);
    assertNoInternalInfraTerms(`${user.statusLabel} ${user.statusDetail}`);
  });

  it("maps waiting_unlock without pool terminology", () => {
    const internal = resolveMaturitySituation(
      {
        ...maturedBase,
        unpaidMaturityChoiceDeadlineAt: null,
      },
      { fifoEligibleIds: new Set(), now: choiceNow }
    );
    const user = toUserFacingMaturityCopy(internal);
    assert.equal(user.statusLabel, "Waiting for returns");
    assert.match(user.statusDetail, /projected payout isn't ready yet/);
    assertNoInternalInfraTerms(`${user.statusLabel} ${user.statusDetail}`);
  });

  it("maps awaiting_admin_payout without treasury terminology", () => {
    const internal = resolveMaturitySituation(
      {
        ...maturedBase,
        payoutUnlockedAt: new Date(),
        payabilityStatus: InvestmentPayabilityStatus.payable,
        unpaidMaturityChoiceDeadlineAt: null,
      },
      { now: choiceNow }
    );
    const user = toUserFacingMaturityCopy(internal);
    assert.equal(user.statusLabel, "Payout processing");
    assert.match(user.statusDetail, /send your transfer shortly/);
    assertNoInternalInfraTerms(`${user.statusLabel} ${user.statusDetail}`);
  });

  it("maps expired choice forfeiture to grow-your-investment copy", () => {
    const expiredDeadline = new Date("2026-06-01T00:00:00.000Z");
    const afterDeadline = new Date("2026-06-10T00:00:00.000Z");
    const internal = resolveMaturitySituation(
      {
        ...maturedBase,
        status: InvestmentStatus.matured,
        unpaidMaturityChoiceDeadlineAt: expiredDeadline,
        unpaidMaturityResolution: null,
      },
      { fifoEligibleIds: new Set(), now: afterDeadline }
    );
    const user = toUserFacingMaturityCopy(internal);
    assert.equal(user.statusLabel, "Term ended — no choice made");
    assert.match(user.statusDetail, /grow your investment/);
    assertNoInternalInfraTerms(`${user.statusLabel} ${user.statusDetail}`);
  });

  it("userForfeitureDetail avoids internal infra terms", () => {
    assertNoInternalInfraTerms(
      userForfeitureDetail(ForfeitureReason.choice_deadline_expired)
    );
    assertNoInternalInfraTerms(
      userForfeitureDetail(ForfeitureReason.boost_window_expired, 2)
    );
    assertNoInternalInfraTerms(userMaturedWaitingEmailBody());
  });

  it("maps boost_window_expired forfeiture copy", () => {
    const detail = userForfeitureDetail(ForfeitureReason.boost_window_expired, 4);
    assert.match(detail, /Boost window ended/);
    assert.match(detail, /4 friends/);
    assert.match(detail, /Recovery or Extra Time cannot be used/);
  });

  it("maps boost_in_progress to high-risk invite copy", () => {
    const internal = resolveMaturitySituation(
      {
        ...maturedBase,
        status: InvestmentStatus.active,
        unpaidMaturityChoiceDeadlineAt: null,
        boostActivatedAt: new Date("2099-06-01T00:00:00.000Z"),
      },
      {
        boostQualifiedCount: 0,
        boostRequiredCount: 2,
        now: choiceNow,
      }
    );
    const user = toUserFacingMaturityCopy(internal);
    assert.equal(user.statusLabel, "Boost in progress");
    assert.match(user.statusDetail, /High risk/);
    assert.match(user.statusDetail, /7 days/);
  });

  it("maps redeemed payout to fund-strategies copy", () => {
    const payoutReason =
      "Unlocked after 2 later investments (25 USDT + 25 USDT). Head invested 25 USDT; required 50 USDT from newer investors (2× cohort). Received 50 USDT (2× equivalent).";
    const internal = resolveMaturitySituation(
      {
        ...maturedBase,
        status: InvestmentStatus.redeemed,
        payoutReason,
        unpaidMaturityChoiceDeadlineAt: null,
        redeemedAt: new Date("2026-06-30T00:00:00.000Z"),
      },
      { now: choiceNow }
    );
    const user = toUserFacingMaturityCopy(internal, {
      fundName: "Hustle Collective",
    });
    assert.equal(user.statusLabel, "Redeemed");
    assert.equal(
      user.statusDetail,
      userRedeemedPayoutDetail("Hustle Collective")
    );
    assert.doesNotMatch(user.statusDetail, /Unlocked after/i);
    assert.doesNotMatch(user.statusDetail, /cohort/i);
  });

  it("maps recovery_in_progress to invite recovery copy", () => {
    const internal = resolveMaturitySituation(
      {
        ...maturedBase,
        unpaidMaturityChoiceDeadlineAt: null,
        recoveryEligibleAt: new Date("2026-06-01T00:00:00.000Z"),
        unpaidMaturityResolution: "referral_recovery" as const,
      },
      {
        fifoEligibleIds: new Set(),
        recoveryQualifiedCount: 1,
        recoveryRequiredCount: 3,
        now: choiceNow,
      }
    );
    const user = toUserFacingMaturityCopy(internal);
    assert.equal(user.statusLabel, "Recover via invites");
    assert.match(user.statusDetail, /1 of 3 friends/);
    assertNoInternalInfraTerms(`${user.statusLabel} ${user.statusDetail}`);
  });

  it("maps extended_active to strategy wait copy", () => {
    const internal = resolveMaturitySituation(
      {
        ...maturedBase,
        status: InvestmentStatus.active,
        unpaidMaturityChoiceDeadlineAt: null,
        unpaidMaturityResolution: "term_extension" as const,
        termExtensionDays: 30,
        maturesAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      { now: choiceNow }
    );
    const user = toUserFacingMaturityCopy(internal);
    assert.equal(user.statusLabel, "Extended — waiting");
    assert.match(user.statusDetail, /30 more days/);
    assert.match(user.statusDetail, /fund strategies/);
  });

  it("maps redeeming to payout on the way copy", () => {
    const internal = resolveMaturitySituation(
      {
        ...maturedBase,
        status: InvestmentStatus.redeeming,
        unpaidMaturityChoiceDeadlineAt: null,
      },
      { now: choiceNow }
    );
    const user = toUserFacingMaturityCopy(internal);
    assert.equal(user.statusLabel, "Claiming…");
    assert.match(user.statusDetail, /on its way/);
  });
});
