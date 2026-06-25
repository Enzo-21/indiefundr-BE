import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentStatus,
  UnpaidMaturityResolution,
} from "@prisma/client";
import { isExcludedFromNormalPayout } from "./referralRecoveryNormalPayout";

describe("isExcludedFromNormalPayout", () => {
  const recoveryPath = {
    unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery,
    status: InvestmentStatus.matured,
    referralRecoveryCompletedAt: null,
  };

  it("excludes matured investments on referral recovery path", () => {
    assert.equal(isExcludedFromNormalPayout(recoveryPath), true);
  });

  it("does not exclude term extension or unresolved investments", () => {
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
