import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { InvestmentStatus } from "@prisma/client";

describe("notifyNewlyMaturedInvestments idempotency", () => {
  it("skips investments already marked with maturityNotifiedAt", async () => {
    const emailCalls: string[] = [];
    const updatedIds: string[] = [];

    mock.module("@/services/mailing/sendInvestmentMaturedEmail", {
      namedExports: {
        sendInvestmentMaturedEmail: async ({
          investment,
        }: {
          investment: { id: string };
        }) => {
          emailCalls.push(investment.id);
          return { ok: true as const };
        },
      },
    });
    mock.module("@/services/orders/pushNotify", {
      namedExports: {
        sendPushNotification: async () => {},
      },
    });
    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          investment: {
            findMany: async () => [
              {
                id: "inv-already",
                fundId: "growth-partners",
                userId: "user-1",
                status: InvestmentStatus.matured,
                maturityNotifiedAt: new Date("2026-01-01T00:00:00.000Z"),
                unpaidMaturityChoiceDeadlineAt: null,
                unpaidMaturityResolution: null,
                payoutUnlockedAt: null,
                user: {
                  id: "user-1",
                  email: "already@example.com",
                  name: "Already",
                  device: null,
                },
              },
              {
                id: "inv-new",
                fundId: "growth-partners",
                userId: "user-2",
                status: InvestmentStatus.matured,
                maturityNotifiedAt: null,
                unpaidMaturityChoiceDeadlineAt: null,
                unpaidMaturityResolution: null,
                payoutUnlockedAt: null,
                user: {
                  id: "user-2",
                  email: "new@example.com",
                  name: "New",
                  device: null,
                },
              },
            ],
            update: async ({ where }: { where: { id: string } }) => {
              updatedIds.push(where.id);
              return { id: where.id };
            },
          },
        },
      },
    });

    const { notifyNewlyMaturedInvestments } = await import(
      "./maturityNotifications"
    );
    const result = await notifyNewlyMaturedInvestments([
      "inv-already",
      "inv-new",
    ]);

    assert.equal(result.emailsSkipped, 1);
    assert.equal(result.emailsSent, 1);
    assert.deepEqual(emailCalls, ["inv-new"]);
    assert.deepEqual(updatedIds, ["inv-new"]);
  });
});
