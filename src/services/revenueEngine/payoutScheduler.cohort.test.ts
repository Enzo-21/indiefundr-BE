import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPayoutReason,
  findUnlockingInvestments,
} from "./payoutScheduler";

describe("weighted triad unlock", () => {
  it("one 50 USDT later investment unlocks a 25 USDT head", () => {
    const head = {
      id: "head",
      userId: "user-a",
      amountUsdt: 25,
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
      excludedFromTriadUnlock: false,
    };
    const later = [
      {
        id: "unlock-50",
        userId: "user-b",
        amountUsdt: 50,
        subscribedAt: new Date("2026-02-01T00:00:00.000Z"),
        excludedFromTriadUnlock: false,
      },
    ];

    const unlockers = findUnlockingInvestments(head, later);
    assert.equal(unlockers.length, 1);
    assert.equal(unlockers[0]?.amountUsdt, 50);

    const reason = buildPayoutReason(25, unlockers);
    assert.match(reason ?? "", /50 USDT/);
    assert.match(reason ?? "", /2× cohort/);
  });

  it("two 75 USDT investments unlock a 50 USDT head", () => {
    const head = {
      id: "head-50",
      userId: "user-a",
      amountUsdt: 50,
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
      excludedFromTriadUnlock: false,
    };
    const later = [
      {
        id: "u1",
        userId: "user-b",
        amountUsdt: 75,
        subscribedAt: new Date("2026-02-01T00:00:00.000Z"),
        excludedFromTriadUnlock: false,
      },
      {
        id: "u2",
        userId: "user-c",
        amountUsdt: 75,
        subscribedAt: new Date("2026-03-01T00:00:00.000Z"),
        excludedFromTriadUnlock: false,
      },
    ];

    const unlockers = findUnlockingInvestments(head, later);
    assert.equal(unlockers.length, 2);
  });

  it("one 75 USDT investment does not unlock a 50 USDT head", () => {
    const head = {
      id: "head-50",
      userId: "user-a",
      amountUsdt: 50,
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
      excludedFromTriadUnlock: false,
    };
    const later = [
      {
        id: "u1",
        userId: "user-b",
        amountUsdt: 75,
        subscribedAt: new Date("2026-02-01T00:00:00.000Z"),
        excludedFromTriadUnlock: false,
      },
    ];

    assert.equal(findUnlockingInvestments(head, later).length, 0);
  });
});
