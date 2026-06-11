import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backfillRecoveryTriadExclusions } from "./recoveryTriadExclusions";

describe("backfillRecoveryTriadExclusions", () => {
  it("marks invitee investments from recovery link inviteIds", async () => {
    const updates: string[] = [];
    const prisma = {
      referralRecoveryLink: {
        findMany: async () => [{ inviteIds: ["invite-1", "invite-2"] }],
      },
      referralPayoutOrder: {
        findFirst: async ({
          where,
        }: {
          where: { referralInviteId: string };
        }) => ({
          investmentId:
            where.referralInviteId === "invite-1"
              ? "invitee-inv-1"
              : "invitee-inv-2",
        }),
      },
      investment: {
        updateMany: async ({
          where,
        }: {
          where: { id: string; excludedFromTriadUnlock: boolean };
        }) => {
          updates.push(where.id);
          return { count: 1 };
        },
      },
    };

    const result = await backfillRecoveryTriadExclusions(prisma as never);

    assert.equal(result.updated, 2);
    assert.equal(result.skipped, 0);
    assert.deepEqual(updates, ["invitee-inv-1", "invitee-inv-2"]);
  });

  it("skips inviteIds without invitee_bonus order investment", async () => {
    const prisma = {
      referralRecoveryLink: {
        findMany: async () => [{ inviteIds: ["invite-missing"] }],
      },
      referralPayoutOrder: {
        findFirst: async () => null,
      },
      investment: {
        updateMany: async () => ({ count: 0 }),
      },
    };

    const result = await backfillRecoveryTriadExclusions(prisma as never);

    assert.equal(result.updated, 0);
    assert.equal(result.skipped, 1);
  });
});
