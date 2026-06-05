import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  PurchaseOrderStatus,
  TreasuryEventType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INVESTMENT_AMOUNT_USDT } from "@/lib/config/revenueEngine";
import {
  broadcastInvestmentPayoutUsdt,
  claimNormalPayout,
  getInvestmentPayoutWorkflowSeed,
  prepareSurplusPayout,
  validateNormalPayoutEligibility,
  validateSurplusPayoutEligibility,
} from "./investmentPayoutFulfillment";
import { getOrCreateLedger } from "@/services/revenueEngine/ledger";
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
  maturesAt = null,
}: {
  label: string;
  subscribedAt: Date;
  status?: InvestmentStatus;
  payoutUnlockedAt?: Date | null;
  maturesAt?: Date | null;
}) {
  const user = await prisma.user.create({
    data: {
      name: `Fulfillment ${label}`,
      email: `fulfillment-${label}-${Date.now()}@example.com`,
    },
  });
  const wallet = await prisma.wallet.create({
    data: {
      userId: user.id,
      name: "Main",
      address: `T${label}${Date.now()}fulfillmentwallet123456789`,
      privateKey: "test-key",
      isMainWallet: true,
    },
  });
  const order = await prisma.purchaseOrder.create({
    data: {
      userId: user.id,
      walletId: wallet.id,
      fundId: "aggressive-alpha",
      costUsdt: INVESTMENT_AMOUNT_USDT(),
      reservedUsdt: INVESTMENT_AMOUNT_USDT(),
      status: PurchaseOrderStatus.completed,
      usdtTxId: `usdt-${label}-${Date.now()}`,
    },
  });
  const investment = await prisma.investment.create({
    data: {
      userId: user.id,
      walletId: wallet.id,
      fundId: "aggressive-alpha",
      amountUsdt: INVESTMENT_AMOUNT_USDT(),
      returnPercent90d: 40,
      projectedPayoutUsdt: 35,
      status,
      purchaseOrderId: order.id,
      subscribedAt,
      maturesAt,
      payoutUnlockedAt,
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

async function restoreLedger(
  ledger: Awaited<ReturnType<typeof getOrCreateLedger>>
) {
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

describe("investmentPayoutFulfillment", () => {
  it("rejects normal validation when investment is not found", async () => {
    await assert.rejects(
      () =>
        validateNormalPayoutEligibility("507f1f77bcf86cd799439011"),
      /Investment not found/
    );
  });

  it(
    "validates unlocked investment for normal payout",
    { skip: skipDbTests },
    async () => {
      mock.method(tron, "validateAddress", async () => true);
      const created = await createInvestedUser({
        label: "validate-normal",
        subscribedAt: new Date("2026-02-01T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-02-03T00:00:00.000Z"),
      });

      try {
        const result = await validateNormalPayoutEligibility(
          created.investment.id
        );
        assert.equal(result.investment.id, created.investment.id);
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
    "validates surplus FIFO eligibility when surplus covers payout",
    { skip: skipDbTests },
    async () => {
      mock.method(tron, "validateAddress", async () => true);
      const ledgerBefore = await getOrCreateLedger();
      const created = await createInvestedUser({
        label: "validate-surplus",
        subscribedAt: new Date("2026-03-01T00:00:00.000Z"),
        maturesAt: new Date("2026-06-01T00:00:00.000Z"),
      });

      try {
        await prisma.treasuryLedger.update({
          where: { id: ledgerBefore.id },
          data: { treasurySurplus: 35 },
        });
        const result = await validateSurplusPayoutEligibility(
          created.investment.id
        );
        assert.equal(result.investment.id, created.investment.id);
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
    "claimNormalPayout is idempotent when already redeeming",
    { skip: skipDbTests },
    async () => {
      mock.method(tron, "validateAddress", async () => true);
      const created = await createInvestedUser({
        label: "claim-idempotent",
        subscribedAt: new Date("2026-04-01T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-04-03T00:00:00.000Z"),
        status: InvestmentStatus.redeeming,
      });

      try {
        await prisma.investment.update({
          where: { id: created.investment.id },
          data: { payoutTriggeredBy: "admin" },
        });
        const first = await claimNormalPayout(created.investment.id, "admin");
        const second = await claimNormalPayout(created.investment.id, "admin");
        assert.equal(first.alreadyClaimed, true);
        assert.equal(second.alreadyClaimed, true);
        assert.equal(first.investment.status, InvestmentStatus.redeeming);
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
    "prepareSurplusPayout is idempotent when surplus already drawn",
    { skip: skipDbTests },
    async () => {
      mock.method(tron, "validateAddress", async () => true);
      const ledgerBefore = await getOrCreateLedger();
      const created = await createInvestedUser({
        label: "surplus-idempotent",
        subscribedAt: new Date("2026-05-01T00:00:00.000Z"),
        maturesAt: new Date("2026-08-01T00:00:00.000Z"),
        status: InvestmentStatus.redeeming,
      });

      try {
        await prisma.treasuryLedger.update({
          where: { id: ledgerBefore.id },
          data: { treasurySurplus: 35 },
        });
        await prisma.investment.update({
          where: { id: created.investment.id },
          data: { payoutTriggeredBy: "admin_surplus_liquidity" },
        });
        await prisma.treasuryEvent.create({
          data: {
            type: TreasuryEventType.surplus_draw,
            amountUsdt: 35,
            investmentId: created.investment.id,
            meta: { reason: "test" },
          },
        });

        const result = await prepareSurplusPayout(
          created.investment.id,
          "admin_surplus_liquidity"
        );
        assert.equal(result.alreadyPrepared, true);
        assert.equal(result.investment.status, InvestmentStatus.redeeming);
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
    "broadcastInvestmentPayoutUsdt is idempotent when tx already stored",
    { skip: skipDbTests },
    async () => {
      const created = await createInvestedUser({
        label: "broadcast-idempotent",
        subscribedAt: new Date("2026-06-01T00:00:00.000Z"),
        status: InvestmentStatus.redeeming,
      });

      try {
        await prisma.investment.update({
          where: { id: created.investment.id },
          data: {
            payoutTriggeredBy: "admin",
            redemptionTransaction: { txID: "existing-broadcast-tx" },
          },
        });

        const result = await broadcastInvestmentPayoutUsdt(
          created.investment.id
        );
        assert.equal(result.alreadyBroadcast, true);
        assert.equal(result.txId, "existing-broadcast-tx");
        assert.ok(result.tronscanUrl.includes("existing-broadcast-tx"));
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
    "getInvestmentPayoutWorkflowSeed reflects redemption tx and surplus draw",
    { skip: skipDbTests },
    async () => {
      const created = await createInvestedUser({
        label: "seed",
        subscribedAt: new Date("2026-07-01T00:00:00.000Z"),
        status: InvestmentStatus.redeeming,
      });

      try {
        await prisma.investment.update({
          where: { id: created.investment.id },
          data: {
            payoutTriggeredBy: "admin_surplus_liquidity",
            payoutFailureReason: null,
            redemptionTransaction: { txID: "seed-redemption-tx" },
          },
        });
        await prisma.treasuryEvent.create({
          data: {
            type: TreasuryEventType.surplus_draw,
            amountUsdt: 35,
            investmentId: created.investment.id,
            meta: { reason: "test" },
          },
        });

        const seed = await getInvestmentPayoutWorkflowSeed(
          created.investment.id
        );
        assert.equal(seed.status, InvestmentStatus.redeeming);
        assert.equal(seed.redemptionTxId, "seed-redemption-tx");
        assert.equal(seed.mode, "surplus");
        assert.equal(seed.surplusDrawn, true);
        assert.equal(seed.payoutFailureReason, null);
        assert.ok(seed.redemptionTronscanUrl?.includes("seed-redemption-tx"));
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
    "getInvestmentPayoutWorkflowSeed surfaces payout failure for retry",
    { skip: skipDbTests },
    async () => {
      const created = await createInvestedUser({
        label: "seed-failure",
        subscribedAt: new Date("2026-08-01T00:00:00.000Z"),
        payoutUnlockedAt: new Date("2026-08-03T00:00:00.000Z"),
      });

      try {
        await prisma.investment.update({
          where: { id: created.investment.id },
          data: {
            payoutFailureReason: "Broadcast failed",
            payoutTriggeredBy: "admin",
          },
        });

        const seed = await getInvestmentPayoutWorkflowSeed(
          created.investment.id
        );
        assert.equal(seed.payoutFailureReason, "Broadcast failed");
        assert.equal(seed.mode, "normal");
        assert.equal(seed.redemptionTxId, null);
        assert.equal(seed.surplusDrawn, false);
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
