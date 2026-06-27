import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  PurchaseOrderStatus,
  TreasuryEventType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COHORT_REFERENCE_INVESTMENT_USDT } from "@/lib/config/investmentCohort";
import { onRedeemCompleted } from "./onRedeemCompleted";
import {
  buildPayoutReadinessClaimWhere,
  buildSurplusPayoutClaimWhere,
  evaluatePayoutReadiness,
  executeInvestmentPayout,
  executeSurplusInvestmentPayout,
  findUnlockingInvestments,
  getSurplusPayoutEligibility,
  processDueAutomaticPayouts,
} from "./payoutScheduler";
import { getOrCreateLedger } from "./ledger";
import {
  acquirePayoutLock,
  PayoutInProgressError,
  releasePayoutLock,
} from "./payoutLock";
import { processRedemptionConfirmations } from "@/services/investments/redemptions";
import * as tron from "@/services/tron/client";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

afterEach(() => {
  mock.restoreAll();
});

async function createInvestedUser({
  label,
  subscribedAt,
  status = InvestmentStatus.active,
  payoutUnlockedAt = null,
  autoPayoutAt = null,
  maturesAt = null,
  existingUser = null,
  existingWallet = null,
}: {
  label: string;
  subscribedAt: Date;
  status?: InvestmentStatus;
  payoutUnlockedAt?: Date | null;
  autoPayoutAt?: Date | null;
  maturesAt?: Date | null;
  existingUser?: { id: string } | null;
  existingWallet?: { id: string } | null;
}) {
  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        name: `Payout ${label}`,
        email: `payout-${label}-${Date.now()}@example.com`,
      },
    }));
  const wallet =
    existingWallet ??
    (await prisma.wallet.create({
      data: {
        userId: user.id,
        name: "Main",
        address: `T${label}${Date.now()}payoutwalletaddress123456789`,
        privateKey: "test-key",
        isMainWallet: true,
      },
    }));
  const order = await prisma.purchaseOrder.create({
    data: {
      userId: user.id,
      walletId: wallet.id,
      fundId: "aggressive-alpha",
      costUsdt: COHORT_REFERENCE_INVESTMENT_USDT,
      reservedUsdt: COHORT_REFERENCE_INVESTMENT_USDT,
      status: PurchaseOrderStatus.completed,
      usdtTxId: `usdt-${label}-${Date.now()}`,
    },
  });
  const investment = await prisma.investment.create({
    data: {
      userId: user.id,
      walletId: wallet.id,
      fundId: "aggressive-alpha",
      amountUsdt: COHORT_REFERENCE_INVESTMENT_USDT,
      returnPercent90d: 40,
      projectedPayoutUsdt: 35,
      status,
      purchaseOrderId: order.id,
      subscribedAt,
      maturesAt,
      payoutUnlockedAt,
      autoPayoutAt,
      ...(payoutUnlockedAt
        ? {
            payabilityStatus: InvestmentPayabilityStatus.payable,
            payoutReason: "Ready for payout",
          }
        : {}),
    },
  });
  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: { investmentId: investment.id },
  });
  return { user, wallet, order, investment };
}

async function cleanup(ids: {
  investmentIds?: string[];
  orderIds?: string[];
  walletIds?: string[];
  userIds?: string[];
}) {
  if (ids.investmentIds?.length) {
    await prisma.treasuryEvent.deleteMany({
      where: { investmentId: { in: ids.investmentIds } },
    });
    await prisma.investment.deleteMany({
      where: { id: { in: ids.investmentIds } },
    });
  }
  if (ids.orderIds?.length) {
    await prisma.purchaseOrder.deleteMany({
      where: { id: { in: ids.orderIds } },
    });
  }
  if (ids.walletIds?.length) {
    await prisma.wallet.deleteMany({ where: { id: { in: ids.walletIds } } });
  }
  if (ids.userIds?.length) {
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}

async function restoreLedger(ledger: Awaited<ReturnType<typeof getOrCreateLedger>>) {
  await prisma.treasuryLedger.update({
    where: { id: ledger.id },
    data: {
      poolAvailable: ledger.poolAvailable,
      treasurySurplus: ledger.treasurySurplus,
      protectedRevenueCredited: ledger.protectedRevenueCredited,
      protectedRevenueWithdrawn: ledger.protectedRevenueWithdrawn,
      subscriberSlotsCredited: ledger.subscriberSlotsCredited,
      subscriberSlotsConsumed: ledger.subscriberSlotsConsumed,
      activePayoutInvestmentId: null,
      activePayoutStartedAt: null,
      activePayoutTrigger: null,
      activePayoutLockExpiresAt: null,
      version: ledger.version,
    },
  });
}

describe("payout scheduler helpers", () => {
  it("allows same user later investments to unlock own earlier investment", () => {
    const base = {
      id: "a",
      userId: "user-a",
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const unlockers = findUnlockingInvestments(base, [
      {
        id: "b1",
        userId: "user-a",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      {
        id: "b2",
        userId: "user-a",
        subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
      },
    ]);

    assert.deepEqual(
      unlockers.map((inv) => inv.id),
      ["b1", "b2"]
    );
  });

  it("two later investments by the same user both count as unlockers", () => {
    const base = {
      id: "a",
      userId: "user-a",
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const unlockers = findUnlockingInvestments(base, [
      {
        id: "b1",
        userId: "user-b",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      {
        id: "b2",
        userId: "user-b",
        subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
      },
      {
        id: "c",
        userId: "user-c",
        subscribedAt: new Date("2026-01-04T00:00:00.000Z"),
      },
    ]);

    assert.deepEqual(
      unlockers.map((inv) => inv.id),
      ["b1", "b2"]
    );
  });

  it("sequential cohort uses first two unused later investments per head (1→2,3; 2→4,5; …)", () => {
    const investments = Array.from({ length: 12 }, (_, index) => {
      const n = index + 1;
      return {
        id: `inv-${n}`,
        userId: `user-${n}`,
        subscribedAt: new Date(Date.UTC(2026, 0, n)),
      };
    });

    const consumed = new Set<string>();
    const pairs: Array<{ head: string; unlockers: string[] }> = [];

    for (const candidate of investments) {
      const unlockers = findUnlockingInvestments(
        candidate,
        investments,
        consumed
      );
      if (unlockers.length < 2) continue;
      for (const unlocker of unlockers) {
        consumed.add(unlocker.id);
      }
      pairs.push({
        head: candidate.id,
        unlockers: unlockers.map((inv) => inv.id),
      });
    }

    assert.equal(pairs.length, 5);
    assert.deepEqual(pairs, [
      { head: "inv-1", unlockers: ["inv-2", "inv-3"] },
      { head: "inv-2", unlockers: ["inv-4", "inv-5"] },
      { head: "inv-3", unlockers: ["inv-6", "inv-7"] },
      { head: "inv-4", unlockers: ["inv-8", "inv-9"] },
      { head: "inv-5", unlockers: ["inv-10", "inv-11"] },
    ]);
  });

  it("skips recovery invitee investments excluded from triad unlock", () => {
    const base = {
      id: "head",
      userId: "user-head",
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const unlockers = findUnlockingInvestments(base, [
      {
        id: "recovery-1",
        userId: "recovery-user-1",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
        excludedFromTriadUnlock: true,
      },
      {
        id: "recovery-2",
        userId: "recovery-user-2",
        subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
        excludedFromTriadUnlock: true,
      },
      {
        id: "normal-1",
        userId: "normal-user-1",
        subscribedAt: new Date("2026-01-04T00:00:00.000Z"),
        excludedFromTriadUnlock: false,
      },
      {
        id: "normal-2",
        userId: "normal-user-2",
        subscribedAt: new Date("2026-01-05T00:00:00.000Z"),
        excludedFromTriadUnlock: false,
      },
    ]);

    assert.deepEqual(
      unlockers.map((inv) => inv.id),
      ["normal-1", "normal-2"]
    );
  });

  it("does not unlock another user when only recovery invitees subscribed later", () => {
    const otherUserHead = {
      id: "other-matured",
      userId: "other-user",
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const unlockers = findUnlockingInvestments(otherUserHead, [
      {
        id: "recovery-only-1",
        userId: "invitee-1",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
        excludedFromTriadUnlock: true,
      },
      {
        id: "recovery-only-2",
        userId: "invitee-2",
        subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
        excludedFromTriadUnlock: true,
      },
    ]);

    assert.equal(unlockers.length, 0);
  });

  it("skips later investments already consumed as unlockers", () => {
    const base = {
      id: "a",
      userId: "user-a",
      subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const unlockers = findUnlockingInvestments(
      base,
      [
        {
          id: "b",
          userId: "user-b",
          subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
        {
          id: "c",
          userId: "user-c",
          subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
        },
        {
          id: "d",
          userId: "user-d",
          subscribedAt: new Date("2026-01-04T00:00:00.000Z"),
        },
      ],
      new Set(["b"])
    );

    assert.deepEqual(
      unlockers.map((inv) => inv.id),
      ["c", "d"]
    );
  });

  it("claims payout readiness with null-or-unset Mongo guards", () => {
    assert.deepEqual(buildPayoutReadinessClaimWhere("investment-1"), {
      AND: [
        { id: "investment-1" },
        {
          status: {
            in: [InvestmentStatus.active, InvestmentStatus.matured],
          },
        },
        {
          OR: [
            { payoutUnlockedAt: null },
            { payoutUnlockedAt: { isSet: false } },
          ],
        },
      ],
    });
  });

  it("surplus payout claim uses the same null-or-unset Mongo guards", () => {
    assert.deepEqual(
      buildSurplusPayoutClaimWhere("investment-2"),
      buildPayoutReadinessClaimWhere("investment-2")
    );
  });

  it("eligible for liquidity surplus when surplus covers payout (no maturity window)", () => {
    const result = getSurplusPayoutEligibility(
      {
        status: InvestmentStatus.active,
        maturesAt: new Date("2026-12-01T00:00:00.000Z"),
        projectedPayoutUsdt: 35,
        payoutUnlockedAt: null,
        redemptionTransaction: null,
      },
      { treasurySurplus: 35 },
      new Date("2026-01-01T00:00:00.000Z")
    );

    assert.equal(result.eligibleForLiquiditySurplusPay, true);
    assert.equal(result.reason, "liquidity_fifo_eligible");
  });

  it("blocks liquidity surplus when normal payout is unlocked", () => {
    const result = getSurplusPayoutEligibility(
      {
        status: InvestmentStatus.active,
        maturesAt: new Date("2026-04-01T00:00:00.000Z"),
        projectedPayoutUsdt: 35,
        payoutUnlockedAt: new Date("2026-03-01T00:00:00.000Z"),
        redemptionTransaction: null,
      },
      { treasurySurplus: 100 },
      new Date()
    );

    assert.equal(result.eligibleForLiquiditySurplusPay, false);
    assert.equal(result.reason, "normal_payout_unlocked");
  });

  it("blocks surplus payout and reports shortfall when surplus is insufficient", () => {
    const result = getSurplusPayoutEligibility(
      {
        status: InvestmentStatus.matured,
        maturesAt: new Date("2026-04-01T00:00:00.000Z"),
        projectedPayoutUsdt: 35,
        payoutUnlockedAt: null,
        redemptionTransaction: null,
      },
      { treasurySurplus: 10 },
      new Date("2026-04-01T00:00:00.000Z")
    );

    assert.equal(result.eligibleForLiquiditySurplusPay, false);
    assert.equal(result.reason, "insufficient_surplus");
    assert.equal(result.surplusShortfallUsdt, 25);
  });

  it("liquidity surplus eligible before maturity when surplus is sufficient", () => {
    const investment = {
      status: InvestmentStatus.active,
      maturesAt: new Date("2026-12-01T00:00:00.000Z"),
      projectedPayoutUsdt: 35,
      payoutUnlockedAt: null,
      redemptionTransaction: null,
    };

    assert.equal(
      getSurplusPayoutEligibility(
        investment,
        { treasurySurplus: 35 },
        new Date("2026-01-01T00:00:00.000Z")
      ).eligibleForLiquiditySurplusPay,
      true
    );
    assert.equal(
      getSurplusPayoutEligibility(
        investment,
        { treasurySurplus: 10 },
        new Date("2026-01-01T00:00:00.000Z")
      ).eligibleForLiquiditySurplusPay,
      false
    );
  });

  it("keeps two-investment unlocked payouts on the normal path", () => {
    const result = getSurplusPayoutEligibility(
      {
        status: InvestmentStatus.matured,
        maturesAt: new Date("2026-04-01T00:00:00.000Z"),
        projectedPayoutUsdt: 35,
        payoutUnlockedAt: new Date("2026-03-10T00:00:00.000Z"),
        redemptionTransaction: null,
      },
      { treasurySurplus: 100 },
      new Date("2026-04-01T00:00:00.000Z")
    );

    assert.equal(result.eligibleForLiquiditySurplusPay, false);
    assert.equal(result.reason, "normal_payout_unlocked");
  });

  it("prevents surplus double-pay for paying or paid investments", () => {
    for (const status of [InvestmentStatus.redeeming, InvestmentStatus.redeemed]) {
      const result = getSurplusPayoutEligibility(
        {
          status,
          maturesAt: new Date("2026-04-01T00:00:00.000Z"),
          projectedPayoutUsdt: 35,
          payoutUnlockedAt: null,
          redemptionTransaction: status === InvestmentStatus.redeeming ? {} : null,
        },
        { treasurySurplus: 100 },
        new Date("2026-04-01T00:00:00.000Z")
      );

      assert.equal(result.eligibleForLiquiditySurplusPay, false);
    }
  });
});

describe("payout scheduler integration", () => {
  it(
    "unlocks the earliest investment after two later investments occur",
    { skip: skipDbTests },
    async () => {
      const created = [
        await createInvestedUser({
          label: "a",
          subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        await createInvestedUser({
          label: "b",
          subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
        await createInvestedUser({
          label: "c",
          subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
        }),
      ];

      try {
        const now = new Date("2026-01-04T00:00:00.000Z");
        const result = await evaluatePayoutReadiness({ now });
        assert.equal(result.updated, 1);

        const [first, second] = await Promise.all([
          prisma.investment.findUniqueOrThrow({
            where: { id: created[0].investment.id },
          }),
          prisma.investment.findUniqueOrThrow({
            where: { id: created[1].investment.id },
          }),
        ]);

        assert.equal(first.payabilityStatus, InvestmentPayabilityStatus.payable);
        assert.equal(first.payoutUnlockedAt?.toISOString(), now.toISOString());
        assert.equal(first.autoPayoutAt, null);
        assert.deepEqual(first.payoutUnlockingInvestmentIds, [
          created[1].investment.id,
          created[2].investment.id,
        ]);
        assert.match(first.payoutReason ?? "", /Unlocked after/);
        assert.equal(second.payoutUnlockedAt, null);
      } finally {
        await cleanup({
          investmentIds: created.map((row) => row.investment.id),
          orderIds: created.map((row) => row.order.id),
          walletIds: created.map((row) => row.wallet.id),
          userIds: created.map((row) => row.user.id),
        });
      }
    }
  );

  it(
    "unlocks earliest investment after same user makes two later investments",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Self Unlock User",
          email: `self-unlock-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `TSelfUnlock${Date.now()}walletaddress123456789`,
          privateKey: "test-key",
          isMainWallet: true,
        },
      });

      const first = await createInvestedUser({
        label: "self-a",
        subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
        existingUser: user,
        existingWallet: wallet,
      });
      const second = await createInvestedUser({
        label: "self-b",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
        existingUser: user,
        existingWallet: wallet,
      });
      const third = await createInvestedUser({
        label: "self-c",
        subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
        existingUser: user,
        existingWallet: wallet,
      });
      const created = [first, second, third];

      try {
        const result = await evaluatePayoutReadiness({
          now: new Date("2026-01-04T00:00:00.000Z"),
        });
        assert.equal(result.updated, 1);

        const firstAfter = await prisma.investment.findUniqueOrThrow({
          where: { id: first.investment.id },
        });
        assert.ok(firstAfter.payoutUnlockedAt);
        assert.deepEqual(firstAfter.payoutUnlockingInvestmentIds, [
          second.investment.id,
          third.investment.id,
        ]);
        assert.match(
          firstAfter.payoutReason ?? "",
          /same user|Unlocked after/i
        );
      } finally {
        await cleanup({
          investmentIds: created.map((row) => row.investment.id),
          orderIds: created.map((row) => row.order.id),
          walletIds: [wallet.id],
          userIds: [user.id],
        });
      }
    }
  );

  it(
    "does not reuse an investment that already unlocked an earlier payout",
    { skip: skipDbTests },
    async () => {
      const first = await createInvestedUser({
        label: "reuse-a",
        subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      const second = await createInvestedUser({
        label: "reuse-b",
        subscribedAt: new Date("2026-01-02T00:00:00.000Z"),
      });
      const third = await createInvestedUser({
        label: "reuse-c",
        subscribedAt: new Date("2026-01-03T00:00:00.000Z"),
      });
      const firstReinvested = await createInvestedUser({
        label: "reuse-a-again",
        subscribedAt: new Date("2026-01-04T00:00:00.000Z"),
        existingUser: first.user,
        existingWallet: first.wallet,
      });

      const created = [first, second, third, firstReinvested];

      try {
        const firstPass = await evaluatePayoutReadiness({
          now: new Date("2026-01-05T00:00:00.000Z"),
        });
        assert.equal(firstPass.updated, 1);

        const [firstAfterFirstPass, secondAfterFirstPass] = await Promise.all([
          prisma.investment.findUniqueOrThrow({
            where: { id: first.investment.id },
          }),
          prisma.investment.findUniqueOrThrow({
            where: { id: second.investment.id },
          }),
        ]);

        assert.deepEqual(firstAfterFirstPass.payoutUnlockingInvestmentIds, [
          second.investment.id,
          third.investment.id,
        ]);
        assert.equal(secondAfterFirstPass.payoutUnlockedAt, null);

        const fourth = await createInvestedUser({
          label: "reuse-d",
          subscribedAt: new Date("2026-01-05T00:00:00.000Z"),
        });
        created.push(fourth);

        const secondPass = await evaluatePayoutReadiness({
          now: new Date("2026-01-06T00:00:00.000Z"),
        });
        assert.equal(secondPass.updated, 1);

        const secondAfterSecondPass = await prisma.investment.findUniqueOrThrow({
          where: { id: second.investment.id },
        });

        assert.deepEqual(secondAfterSecondPass.payoutUnlockingInvestmentIds, [
          firstReinvested.investment.id,
          fourth.investment.id,
        ]);
      } finally {
        await cleanup({
          investmentIds: created.map((row) => row.investment.id),
          orderIds: created.map((row) => row.order.id),
          walletIds: Array.from(new Set(created.map((row) => row.wallet.id))),
          userIds: Array.from(new Set(created.map((row) => row.user.id))),
        });
      }
    }
  );

  it(
    "admin payout broadcasts once and moves unlocked investment to redeeming",
    { skip: skipDbTests },
    async () => {
      mock.method(tron, "validateAddress", async () => true);
      mock.method(tron, "transferUsdt", async () => ({
        txID: "mock-admin-payout",
      }));

      const created = await createInvestedUser({
        label: "admin",
        subscribedAt: new Date("2026-02-01T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-02-03T00:00:00.000Z"),
        autoPayoutAt: new Date("2026-02-20T00:00:00.000Z"),
      });

      try {
        const result = await executeInvestmentPayout(
          created.investment.id,
          "admin"
        );
        assert.equal(result.investment.status, InvestmentStatus.redeeming);
        assert.equal(result.investment.payoutTriggeredBy, "admin");
        assert.ok(result.investment.redemptionTransaction);
      } finally {
        await cleanup({
          investmentIds: [created.investment.id],
          orderIds: [created.order.id],
          walletIds: [created.wallet.id],
          userIds: [created.user.id],
        });
      }
    }
  );

  it(
    "automatic cron payouts are disabled",
    { skip: skipDbTests },
    async () => {
      const due = await createInvestedUser({
        label: "due",
        subscribedAt: new Date("2026-03-01T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-03-03T00:00:00.000Z"),
        autoPayoutAt: new Date("2026-03-10T00:00:00.000Z"),
      });

      try {
        const result = await processDueAutomaticPayouts({
          now: new Date("2026-03-11T00:00:00.000Z"),
        });
        assert.equal(result.processed, 0);

        const dueAfter = await prisma.investment.findUniqueOrThrow({
          where: { id: due.investment.id },
        });
        assert.equal(dueAfter.status, InvestmentStatus.active);
        assert.equal(dueAfter.payoutTriggeredBy, null);
      } finally {
        await cleanup({
          investmentIds: [due.investment.id],
          orderIds: [due.order.id],
          walletIds: [due.wallet.id],
          userIds: [due.user.id],
        });
      }
    }
  );

  it(
    "rejects admin payout while another payout is active",
    { skip: skipDbTests },
    async () => {
      const ledgerBefore = await getOrCreateLedger();
      const locked = await createInvestedUser({
        label: "locked",
        subscribedAt: new Date("2026-05-01T00:00:00.000Z"),
      });
      const target = await createInvestedUser({
        label: "blocked",
        subscribedAt: new Date("2026-05-02T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-05-03T00:00:00.000Z"),
      });

      try {
        await acquirePayoutLock(locked.investment.id, "cron_surplus");
        await assert.rejects(
          () => executeInvestmentPayout(target.investment.id, "admin"),
          PayoutInProgressError
        );
      } finally {
        await releasePayoutLock(locked.investment.id);
        await cleanup({
          investmentIds: [locked.investment.id, target.investment.id],
          orderIds: [locked.order.id, target.order.id],
          walletIds: [locked.wallet.id, target.wallet.id],
          userIds: [locked.user.id, target.user.id],
        });
        await restoreLedger(ledgerBefore);
      }
    }
  );

  it(
    "cron payout pass is a no-op while an admin payout lock is active",
    { skip: skipDbTests },
    async () => {
      const ledgerBefore = await getOrCreateLedger();
      const locked = await createInvestedUser({
        label: "admin-lock",
        subscribedAt: new Date("2026-06-01T00:00:00.000Z"),
      });
      const due = await createInvestedUser({
        label: "cron-skip",
        subscribedAt: new Date("2026-06-02T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-06-03T00:00:00.000Z"),
      });

      try {
        await acquirePayoutLock(locked.investment.id, "admin");
        const result = await processDueAutomaticPayouts({
          now: new Date("2026-06-05T00:00:00.000Z"),
        });
        assert.equal(result.processed, 0);
        assert.equal(result.skipped, 0);
      } finally {
        await releasePayoutLock(locked.investment.id);
        await cleanup({
          investmentIds: [locked.investment.id, due.investment.id],
          orderIds: [locked.order.id, due.order.id],
          walletIds: [locked.wallet.id, due.wallet.id],
          userIds: [locked.user.id, due.user.id],
        });
        await restoreLedger(ledgerBefore);
      }
    }
  );

  it(
    "releases the payout lock after successful redemption confirmation",
    { skip: skipDbTests },
    async () => {
      mock.method(tron, "validateAddress", async () => true);
      mock.method(tron, "transferUsdt", async () => ({
        txID: "mock-confirmed-payout",
      }));
      mock.method(tron, "getTransactionStatus", async () => "confirmed");

      const ledgerBefore = await getOrCreateLedger();
      const created = await createInvestedUser({
        label: "release-success",
        subscribedAt: new Date("2026-07-01T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-07-03T00:00:00.000Z"),
      });

      try {
        await executeInvestmentPayout(created.investment.id, "admin");
        let ledger = await getOrCreateLedger();
        assert.equal(ledger.activePayoutInvestmentId, created.investment.id);

        await processRedemptionConfirmations();
        ledger = await getOrCreateLedger();
        assert.equal(ledger.activePayoutInvestmentId, null);
      } finally {
        await cleanup({
          investmentIds: [created.investment.id],
          orderIds: [created.order.id],
          walletIds: [created.wallet.id],
          userIds: [created.user.id],
        });
        await restoreLedger(ledgerBefore);
      }
    }
  );

  it(
    "restores surplus and releases the payout lock after failed surplus redemption",
    { skip: skipDbTests },
    async () => {
      mock.method(tron, "validateAddress", async () => true);
      mock.method(tron, "transferUsdt", async () => ({
        txID: "mock-failed-surplus-payout",
      }));
      mock.method(tron, "getTransactionStatus", async () => "failed");

      const ledgerBefore = await getOrCreateLedger();
      const created = await createInvestedUser({
        label: "surplus-fail",
        subscribedAt: new Date("2026-08-01T00:00:00.000Z"),
        maturesAt: new Date("2026-11-01T00:00:00.000Z"),
      });

      try {
        await prisma.treasuryLedger.update({
          where: { id: ledgerBefore.id },
          data: { treasurySurplus: 35 },
        });
        await executeSurplusInvestmentPayout(
          created.investment.id,
          "admin_surplus_liquidity"
        );
        let ledger = await getOrCreateLedger();
        assert.equal(ledger.treasurySurplus, 0);
        assert.equal(ledger.activePayoutInvestmentId, created.investment.id);

        await processRedemptionConfirmations();
        ledger = await getOrCreateLedger();
        assert.equal(ledger.treasurySurplus, 35);
        assert.equal(ledger.activePayoutInvestmentId, null);
      } finally {
        await cleanup({
          investmentIds: [created.investment.id],
          orderIds: [created.order.id],
          walletIds: [created.wallet.id],
          userIds: [created.user.id],
        });
        await restoreLedger(ledgerBefore);
      }
    }
  );

  it(
    "recovers expired payout locks only when no redemption transaction is pending",
    { skip: skipDbTests },
    async () => {
      const ledgerBefore = await getOrCreateLedger();
      const locked = await createInvestedUser({
        label: "stale-lock",
        subscribedAt: new Date("2026-09-01T00:00:00.000Z"),
        status: InvestmentStatus.redeeming,
      });
      const target = await createInvestedUser({
        label: "stale-target",
        subscribedAt: new Date("2026-09-02T00:00:00.000Z"),
      });
      const now = new Date("2026-09-10T00:00:00.000Z");

      try {
        await prisma.investment.update({
          where: { id: locked.investment.id },
          data: { redemptionTransaction: { txID: "pending-redemption" } },
        });
        await prisma.treasuryLedger.update({
          where: { id: ledgerBefore.id },
          data: {
            activePayoutInvestmentId: locked.investment.id,
            activePayoutStartedAt: new Date("2026-09-01T00:00:00.000Z"),
            activePayoutTrigger: "admin",
            activePayoutLockExpiresAt: new Date("2026-09-01T00:30:00.000Z"),
          },
        });

        await assert.rejects(
          () => acquirePayoutLock(target.investment.id, "cron", now),
          PayoutInProgressError
        );

        await prisma.investment.update({
          where: { id: locked.investment.id },
          data: { redemptionTransaction: null },
        });
        await acquirePayoutLock(target.investment.id, "cron", now);
        const ledger = await getOrCreateLedger();
        assert.equal(ledger.activePayoutInvestmentId, target.investment.id);
      } finally {
        await releasePayoutLock(target.investment.id);
        await releasePayoutLock(locked.investment.id);
        await cleanup({
          investmentIds: [locked.investment.id, target.investment.id],
          orderIds: [locked.order.id, target.order.id],
          walletIds: [locked.wallet.id, target.wallet.id],
          userIds: [locked.user.id, target.user.id],
        });
        await restoreLedger(ledgerBefore);
      }
    }
  );

  it(
    "redemption completion records payout trigger and reason in ledger event",
    { skip: skipDbTests },
    async () => {
      const created = await createInvestedUser({
        label: "ledger",
        subscribedAt: new Date("2026-04-01T00:00:00.000Z"),
        status: InvestmentStatus.redeemed,
        payoutUnlockedAt: new Date("2026-04-03T00:00:00.000Z"),
      });
      const investment = await prisma.investment.update({
        where: { id: created.investment.id },
        data: {
          payoutTriggeredBy: "admin",
          payoutReason: "Two later investments (User B and User C) unlocked this payout.",
          payoutUnlockingInvestmentIds: ["b", "c"],
          payoutUnlockingUserIds: ["user-b", "user-c"],
        },
      });

      try {
        await onRedeemCompleted(investment);
        const event = await prisma.treasuryEvent.findFirst({
          where: {
            investmentId: investment.id,
            type: TreasuryEventType.payout_outflow,
          },
          orderBy: { createdAt: "desc" },
        });
        assert.ok(event);
        assert.equal((event?.meta as { fromSurplus?: number }).fromSurplus, 0);
        assert.equal((event?.meta as { trigger?: string }).trigger, "admin");
        assert.equal(
          (event?.meta as { reason?: string }).reason,
          "Two later investments (User B and User C) unlocked this payout."
        );
        assert.deepEqual(
          (event?.meta as { unlockingInvestmentIds?: string[] })
            .unlockingInvestmentIds,
          ["b", "c"]
        );
        assert.deepEqual(
          (event?.meta as { unlockingUserIds?: string[] }).unlockingUserIds,
          ["user-b", "user-c"]
        );
      } finally {
        await cleanup({
          investmentIds: [created.investment.id],
          orderIds: [created.order.id],
          walletIds: [created.wallet.id],
          userIds: [created.user.id],
        });
      }
    }
  );
});
