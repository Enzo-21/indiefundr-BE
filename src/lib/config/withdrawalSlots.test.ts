import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WithdrawalOrderStatus } from "@prisma/client";
import {
  WithdrawalSlotsEmptyError,
  assertCanCreateWithdrawal,
  computeWithdrawalSlotUsage,
  getWithdrawalSlotUsage,
} from "./withdrawalSlots";

describe("computeWithdrawalSlotUsage", () => {
  it("computes available as earned minus used", () => {
    const usage = computeWithdrawalSlotUsage({
      earned: 3,
      openWithdrawals: 1,
      completedWithdrawals: 1,
    });
    assert.deepEqual(usage, {
      earned: 3,
      used: 2,
      available: 1,
      openWithdrawals: 1,
      completedWithdrawals: 1,
    });
  });

  it("never returns negative available", () => {
    const usage = computeWithdrawalSlotUsage({
      earned: 1,
      openWithdrawals: 0,
      completedWithdrawals: 2,
    });
    assert.equal(usage.available, 0);
    assert.equal(usage.used, 2);
  });

  it("returns zero available when user never invested", () => {
    const usage = computeWithdrawalSlotUsage({
      earned: 0,
      openWithdrawals: 0,
      completedWithdrawals: 0,
    });
    assert.equal(usage.available, 0);
  });
});

describe("getWithdrawalSlotUsage", () => {
  it("aggregates prisma counts into usage", async () => {
    const client = {
      investment: {
        count: async () => 2,
      },
      withdrawalOrder: {
        count: async ({
          where,
        }: {
          where: { status: WithdrawalOrderStatus | { in: WithdrawalOrderStatus[] } };
        }) => {
          if (where.status === WithdrawalOrderStatus.completed) {
            return 0;
          }
          return 1; // open queued/processing
        },
      },
    };

    const usage = await getWithdrawalSlotUsage("user-1", client as never);
    assert.equal(usage.earned, 2);
    assert.equal(usage.openWithdrawals, 1);
    assert.equal(usage.completedWithdrawals, 0);
    assert.equal(usage.used, 1);
    assert.equal(usage.available, 1);
  });
});

describe("assertCanCreateWithdrawal", () => {
  it("throws WithdrawalSlotsEmptyError when available is zero", async () => {
    const client = {
      investment: { count: async () => 0 },
      withdrawalOrder: { count: async () => 0 },
    };
    await assert.rejects(
      () => assertCanCreateWithdrawal("user-1", client as never),
      (err: unknown) => {
        assert.ok(err instanceof WithdrawalSlotsEmptyError);
        assert.equal(err.code, "WITHDRAWAL_SLOTS_EMPTY");
        assert.equal(err.available, 0);
        assert.match(err.message, /Each investment grants one withdrawal/i);
        return true;
      }
    );
  });

  it("returns usage when a slot is available", async () => {
    const client = {
      investment: { count: async () => 1 },
      withdrawalOrder: {
        count: async () => 0,
      },
    };
    const usage = await assertCanCreateWithdrawal("user-1", client as never);
    assert.equal(usage.available, 1);
    assert.equal(usage.earned, 1);
  });
});
