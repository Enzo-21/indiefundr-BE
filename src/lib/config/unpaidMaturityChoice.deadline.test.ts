import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  choiceDeadlineAt,
  hasActiveUnpaidMaturityChoiceWindow,
  isChoiceDeadlineActive,
  UNPAID_MATURITY_CHOICE_HOURS,
} from "./unpaidMaturityChoice";
import { InvestmentStatus } from "@prisma/client";

describe("unpaid maturity choice deadline", () => {
  it("choiceDeadlineAt adds configured hours", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const deadline = choiceDeadlineAt(start);
    const hours = UNPAID_MATURITY_CHOICE_HOURS();
    const expected = new Date(start.getTime() + hours * 60 * 60 * 1000);
    assert.equal(deadline.toISOString(), expected.toISOString());
  });

  it("isChoiceDeadlineActive is true before deadline", () => {
    const deadline = new Date("2026-01-03T00:00:00.000Z");
    const now = new Date("2026-01-02T00:00:00.000Z");
    assert.equal(isChoiceDeadlineActive(deadline, now), true);
  });

  it("isChoiceDeadlineActive is false on or after deadline", () => {
    const deadline = new Date("2026-01-03T00:00:00.000Z");
    assert.equal(isChoiceDeadlineActive(deadline, deadline), false);
    assert.equal(
      isChoiceDeadlineActive(deadline, new Date("2026-01-04T00:00:00.000Z")),
      false
    );
  });

  it("hasActiveUnpaidMaturityChoiceWindow requires matured status and open deadline", () => {
    const deadline = new Date("2099-06-05T12:00:00.000Z");
    const now = new Date("2099-06-03T12:00:00.000Z");
    assert.equal(
      hasActiveUnpaidMaturityChoiceWindow(
        {
          status: InvestmentStatus.matured,
          unpaidMaturityResolution: null,
          unpaidMaturityChoiceDeadlineAt: deadline,
        },
        now
      ),
      true
    );
    assert.equal(
      hasActiveUnpaidMaturityChoiceWindow(
        {
          status: InvestmentStatus.active,
          unpaidMaturityResolution: null,
          unpaidMaturityChoiceDeadlineAt: deadline,
        },
        now
      ),
      false
    );
  });
});
