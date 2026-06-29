import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentStatus,
  UnpaidMaturityResolution,
} from "@prisma/client";
import {
  isExcludedFromNormalPayout,
  normalPayoutExclusionReason,
} from "./referralRecoveryNormalPayout";

describe("isExcludedFromNormalPayout", () => {
  const recoveryPath = {
    unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery,
    status: InvestmentStatus.matured,
    referralRecoveryCompletedAt: null,
    unpaidMaturityChoiceDeadlineAt: null,
  };

  const choiceWindow = {
    unpaidMaturityResolution: null,
    status: InvestmentStatus.matured,
    referralRecoveryCompletedAt: null,
    unpaidMaturityChoiceDeadlineAt: new Date("2099-06-05T12:00:00.000Z"),
  };

  it("excludes matured investments on referral recovery path", () => {
    assert.equal(isExcludedFromNormalPayout(recoveryPath), true);
    assert.equal(
      normalPayoutExclusionReason(recoveryPath),
      "referral_recovery_path"
    );
  });

  it("excludes matured investments with an active unpaid maturity choice window", () => {
    const now = new Date("2099-06-03T12:00:00.000Z");
    assert.equal(isExcludedFromNormalPayout(choiceWindow, now), true);
    assert.equal(
      normalPayoutExclusionReason(choiceWindow, now),
      "unpaid_maturity_choice_pending"
    );
  });

  it("does not exclude term extension or unresolved investments without choice window", () => {
    assert.equal(
      isExcludedFromNormalPayout({
        ...recoveryPath,
        unpaidMaturityResolution: UnpaidMaturityResolution.term_extension,
      }),
      false
    );
    assert.equal(
      isExcludedFromNormalPayout({
        ...recoveryPath,
        unpaidMaturityResolution: null,
      }),
      false
    );
  });

  it("does not exclude after principal recovery closes the investment", () => {
    assert.equal(
      isExcludedFromNormalPayout({
        ...recoveryPath,
        status: InvestmentStatus.referral_recovered,
        referralRecoveryCompletedAt: new Date(),
      }),
      false
    );
  });
});
