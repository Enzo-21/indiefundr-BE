import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentStatus,
} from "@prisma/client";
import { resolveMaturityEmailScenario } from "./resolveMaturityEmailScenario";

const now = new Date("2026-06-20T12:00:00.000Z");
const deadline = new Date("2026-06-22T12:00:00.000Z");

const maturedBase = {
  id: "inv-1",
  status: InvestmentStatus.matured,
  payoutUnlockedAt: null,
  unpaidMaturityChoiceDeadlineAt: null,
  unpaidMaturityResolution: null,
  referralRecoveryCompletedAt: null,
  subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
  projectedPayoutUsdt: 31.25,
  maturesAt: new Date("2026-06-01T00:00:00.000Z"),
};

describe("resolveMaturityEmailScenario", () => {
  it("returns payout_eligible when triad-unlocked", () => {
    assert.equal(
      resolveMaturityEmailScenario(
        { ...maturedBase, payoutUnlockedAt: new Date() },
        new Set(),
        now
      ),
      "payout_eligible"
    );
  });

  it("returns choice_required when unpaid maturity choice is pending", () => {
    assert.equal(
      resolveMaturityEmailScenario(
        {
          ...maturedBase,
          unpaidMaturityChoiceDeadlineAt: deadline,
        },
        new Set(),
        now
      ),
      "choice_required"
    );
  });

  it("returns payout_eligible when fifo surplus eligible", () => {
    assert.equal(
      resolveMaturityEmailScenario(maturedBase, new Set(["inv-1"]), now),
      "payout_eligible"
    );
  });

  it("returns waiting when matured without unlock, choice, or fifo eligibility", () => {
    assert.equal(
      resolveMaturityEmailScenario(maturedBase, new Set(), now),
      "waiting"
    );
  });

  it("prefers choice_required over fifo eligibility", () => {
    assert.equal(
      resolveMaturityEmailScenario(
        {
          ...maturedBase,
          unpaidMaturityChoiceDeadlineAt: deadline,
        },
        new Set(["inv-1"]),
        now
      ),
      "choice_required"
    );
  });
});
