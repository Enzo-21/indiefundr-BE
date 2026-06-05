import assert from "node:assert/strict";
import { InvestmentStatus } from "@prisma/client";
import { describe, it } from "node:test";
import {
  computeFifoSurplusEligibleInvestmentIds,
  getSurplusPayoutEligibilityWithFifo,
  pickNextFifoSurplusPayoutInvestmentId,
  type FifoSurplusPayoutCandidate,
} from "./payoutScheduler";

function candidate(
  overrides: Partial<FifoSurplusPayoutCandidate> & { id: string }
): FifoSurplusPayoutCandidate {
  return {
    id: overrides.id,
    subscribedAt: overrides.subscribedAt ?? new Date("2026-01-01"),
    status: InvestmentStatus.matured,
    projectedPayoutUsdt: 28.75,
    payoutUnlockedAt: null,
    redemptionTransaction: null,
    maturesAt: new Date("2026-04-01"),
    ...overrides,
  };
}

describe("computeFifoSurplusEligibleInvestmentIds", () => {
  it("allocates only the first investment when surplus fits one of two payouts", () => {
    const investments = [
      candidate({
        id: "inv-a",
        subscribedAt: new Date("2026-01-01"),
        projectedPayoutUsdt: 31,
      }),
      candidate({
        id: "inv-b",
        subscribedAt: new Date("2026-01-02"),
        projectedPayoutUsdt: 35,
      }),
    ];
    const eligible = computeFifoSurplusEligibleInvestmentIds(investments, {
      treasurySurplus: 50,
    });
    assert.deepEqual([...eligible], ["inv-a"]);
  });

  it("allocates eight equal payouts when surplus is 80 and each needs 10", () => {
    const investments = Array.from({ length: 10 }, (_, index) =>
      candidate({
        id: `inv-${index + 1}`,
        subscribedAt: new Date(Date.UTC(2026, 0, index + 1)),
        projectedPayoutUsdt: 10,
      })
    );
    const eligible = computeFifoSurplusEligibleInvestmentIds(investments, {
      treasurySurplus: 80,
    });
    assert.equal(eligible.size, 8);
    assert.equal(eligible.has("inv-1"), true);
    assert.equal(eligible.has("inv-8"), true);
    assert.equal(eligible.has("inv-9"), false);
  });

  it("returns none when earliest candidate exceeds surplus", () => {
    const investments = [
      candidate({
        id: "inv-a",
        subscribedAt: new Date("2026-01-01"),
        projectedPayoutUsdt: 60,
      }),
      candidate({
        id: "inv-b",
        subscribedAt: new Date("2026-01-02"),
        projectedPayoutUsdt: 31,
      }),
    ];
    const eligible = computeFifoSurplusEligibleInvestmentIds(investments, {
      treasurySurplus: 50,
    });
    assert.equal(eligible.size, 0);
  });

  it("skips redeemed and unlocked rows without stopping the queue", () => {
    const investments = [
      candidate({
        id: "inv-a",
        subscribedAt: new Date("2026-01-01"),
        status: InvestmentStatus.redeemed,
        projectedPayoutUsdt: 40,
      }),
      candidate({
        id: "inv-b",
        subscribedAt: new Date("2026-01-02"),
        payoutUnlockedAt: new Date("2026-02-01"),
        projectedPayoutUsdt: 40,
      }),
      candidate({
        id: "inv-c",
        subscribedAt: new Date("2026-01-03"),
        projectedPayoutUsdt: 25,
      }),
    ];
    const eligible = computeFifoSurplusEligibleInvestmentIds(investments, {
      treasurySurplus: 30,
    });
    assert.deepEqual([...eligible], ["inv-c"]);
  });
});

describe("getSurplusPayoutEligibilityWithFifo", () => {
  it("marks fifo-blocked when payout fits total surplus but not remaining FIFO budget", () => {
    const investments = [
      candidate({
        id: "inv-a",
        subscribedAt: new Date("2026-01-01"),
        projectedPayoutUsdt: 31,
      }),
      candidate({
        id: "inv-b",
        subscribedAt: new Date("2026-01-02"),
        projectedPayoutUsdt: 35,
      }),
    ];
    const fifoEligibleIds = computeFifoSurplusEligibleInvestmentIds(
      investments,
      { treasurySurplus: 50 }
    );
    const blocked = getSurplusPayoutEligibilityWithFifo(
      investments[1]!,
      { treasurySurplus: 50 },
      fifoEligibleIds
    );
    assert.equal(blocked.reason, "fifo_surplus_blocked");
    assert.equal(blocked.eligibleForLiquiditySurplusPay, false);
  });
});

describe("pickNextFifoSurplusPayoutInvestmentId", () => {
  it("returns earliest subscriber when both fit current surplus", () => {
    const next = pickNextFifoSurplusPayoutInvestmentId(
      [
        candidate({
          id: "inv-b",
          subscribedAt: new Date("2026-01-02"),
          projectedPayoutUsdt: 27,
        }),
        candidate({
          id: "inv-a",
          subscribedAt: new Date("2026-01-01"),
          projectedPayoutUsdt: 28,
        }),
      ],
      { treasurySurplus: 30 }
    );
    assert.equal(next, "inv-a");
  });

  it("skips redeemed head and returns next eligible", () => {
    const next = pickNextFifoSurplusPayoutInvestmentId(
      [
        candidate({
          id: "inv-a",
          subscribedAt: new Date("2026-01-01"),
          status: InvestmentStatus.redeemed,
          projectedPayoutUsdt: 28,
        }),
        candidate({
          id: "inv-b",
          subscribedAt: new Date("2026-01-02"),
          projectedPayoutUsdt: 27,
        }),
      ],
      { treasurySurplus: 30 }
    );
    assert.equal(next, "inv-b");
  });

  it("returns null when surplus cannot cover earliest payout", () => {
    const next = pickNextFifoSurplusPayoutInvestmentId(
      [
        candidate({
          id: "inv-a",
          subscribedAt: new Date("2026-01-01"),
          projectedPayoutUsdt: 28,
        }),
      ],
      { treasurySurplus: 25 }
    );
    assert.equal(next, null);
  });
});
