import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentStatus,
  UnpaidMaturityResolution,
} from "@prisma/client";
import { isRecoveryCandidate } from "@/services/referrals/recoveryEligibility";
import {
  isForfeitureCandidateOnMaturity,
} from "@/services/investments/investmentForfeiture";
import { isUnpaidMaturityChoicePending } from "@/services/investments/unpaidMaturityChoice";

describe("investment forfeiture helpers", () => {
  it("detects second-maturity forfeiture candidates", () => {
    assert.equal(
      isForfeitureCandidateOnMaturity({
        unpaidMaturityResolution: UnpaidMaturityResolution.term_extension,
      }),
      true
    );
    assert.equal(
      isForfeitureCandidateOnMaturity({
        unpaidMaturityResolution: UnpaidMaturityResolution.referral_recovery,
      }),
      false
    );
  });

  it("excludes forfeited investments from recovery candidacy", () => {
    const fifo = new Set<string>();
    assert.equal(
      isRecoveryCandidate(
        {
          id: "inv-1",
          status: InvestmentStatus.forfeited,
          payoutUnlockedAt: null,
          referralRecoveryCompletedAt: null,
          subscribedAt: new Date(),
          projectedPayoutUsdt: 30,
          maturesAt: new Date(),
        },
        fifo
      ),
      false
    );
  });

  it("does not treat expired choice deadline as pending", () => {
    const fifo = new Set<string>();
    const now = new Date("2026-06-10T00:00:00.000Z");
    assert.equal(
      isUnpaidMaturityChoicePending(
        {
          id: "inv-1",
          status: InvestmentStatus.matured,
          payoutUnlockedAt: null,
          referralRecoveryCompletedAt: null,
          unpaidMaturityResolution: null,
          unpaidMaturityChoiceDeadlineAt: new Date("2026-06-01T00:00:00.000Z"),
          subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
          projectedPayoutUsdt: 30,
          maturesAt: new Date("2026-04-01T00:00:00.000Z"),
        },
        fifo,
        now
      ),
      false
    );
  });
});
