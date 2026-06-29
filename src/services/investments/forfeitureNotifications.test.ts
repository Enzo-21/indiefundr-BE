import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { ForfeitureReason } from "@prisma/client";

describe("notifyInvestmentForfeited", () => {
  it("sends email once, skips when already notified", async () => {
    let emailCalls = 0;
    let updateData: { forfeitureNotifiedAt?: Date } | null = null;

    mock.module("@/services/mailing/sendInvestmentForfeitedEmail", {
      namedExports: {
        sendInvestmentForfeitedEmail: async () => {
          emailCalls += 1;
          return { ok: true as const };
        },
      },
    });
    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          user: {
            findUnique: async () => ({
              email: "user@example.com",
              name: "User",
              device: null,
            }),
          },
          investment: {
            update: async ({
              data,
            }: {
              data: { forfeitureNotifiedAt: Date };
            }) => {
              updateData = data;
              return {};
            },
          },
        },
      },
    });

    const { notifyInvestmentForfeited } = await import(
      "./forfeitureNotifications"
    );

    const first = await notifyInvestmentForfeited({
      id: "inv-1",
      userId: "user-1",
      fundId: "growth-partners",
      amountUsdt: 25,
      forfeitureReason: ForfeitureReason.choice_deadline_expired,
      forfeitureNotifiedAt: null,
    });

    assert.equal(emailCalls, 1);
    assert.equal(first.emailSent, true);
    assert.ok(updateData?.forfeitureNotifiedAt instanceof Date);

    const second = await notifyInvestmentForfeited({
      id: "inv-1",
      userId: "user-1",
      fundId: "growth-partners",
      amountUsdt: 25,
      forfeitureReason: ForfeitureReason.second_maturity_unpaid,
      forfeitureNotifiedAt: new Date(),
    });

    assert.equal(emailCalls, 1);
    assert.equal(second.emailSent, false);
  });
});
