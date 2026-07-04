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
} from "./userMaturityCopy";

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
    assertNoInternalInfraTerms(userMaturedWaitingEmailBody());
  });
});
