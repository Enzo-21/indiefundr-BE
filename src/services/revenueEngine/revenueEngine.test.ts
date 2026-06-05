import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
  PurchaseOrderStatus,
  TreasuryEventType,
} from "@prisma/client";
import {
  additionalInflowNeeded,
  APP_NET_REVENUE_PER_SUBSCRIBER_USDT,
  INVESTMENT_AMOUNT_USDT,
  newSubscribersNeeded,
  roundUsdt,
  surplusPerSubscriber,
} from "@/lib/config/revenueEngine";
import { GLOBAL_LEDGER_ID, prisma } from "@/lib/prisma";
import { evaluateAll } from "./evaluateAll";
import { buildGlobalQueue, getPayableInvestmentForUser } from "./queue";
import {
  canFundFromPool,
  getPoolMin,
  liquidityShortfall,
} from "./pool";
import { riskRank } from "./riskRank";
import { recordSubscribeInflow } from "./ledger";
import { onRedeemCompleted } from "./onRedeemCompleted";

import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("revenueEngine config math", () => {
  it("newSubscribersNeeded: Aggressive head coverage steps", () => {
    assert.equal(newSubscribersNeeded(25, 35), 2);
    assert.equal(newSubscribersNeeded(50, 35), 1);
    assert.equal(newSubscribersNeeded(75, 35), 0);
  });

  it("additionalInflowNeeded matches canonical triad", () => {
    assert.equal(additionalInflowNeeded(25, 35), 50);
    assert.equal(additionalInflowNeeded(75, 35), 0);
  });

  it("surplusPerSubscriber: Capital triad pool_after 48.5", () => {
    const surplus = surplusPerSubscriber(48.5, 3);
    assert.ok(Math.abs(surplus - 8.5 / 3) < 0.01);
  });

  it("surplusPerSubscriber: Aggressive triad pool_after 40 is zero", () => {
    assert.equal(surplusPerSubscriber(40, 3), 0);
  });

  it("triad protected share: 10 subscribers × P_prot = 100 USDT", () => {
    assert.equal(10 * APP_NET_REVENUE_PER_SUBSCRIBER_USDT(), 100);
  });
});

describe("revenueEngine queue", () => {
  it("riskRank: Capital before Aggressive", () => {
    assert.ok(riskRank("capital-shield") < riskRank("aggressive-alpha"));
  });

  it("intra-user queue: Capital paid before Aggressive (Case B)", () => {
    const userId = "507f1f77bcf86cd799439011";
    const investments = [
      {
        id: "a1",
        userId,
        fundId: "aggressive-alpha",
        subscribedAt: new Date("2024-01-01"),
        status: InvestmentStatus.matured,
        projectedPayoutUsdt: 35,
      },
      {
        id: "a2",
        userId,
        fundId: "capital-shield",
        subscribedAt: new Date("2024-01-10"),
        status: InvestmentStatus.matured,
        projectedPayoutUsdt: 26.5,
      },
    ] as Parameters<typeof getPayableInvestmentForUser>[0];

    const payable = getPayableInvestmentForUser(investments);
    assert.equal(payable?.fundId, "capital-shield");
  });

  it("global queue: User B Stable before User A Capital (Case C)", () => {
    const userA = "507f1f77bcf86cd799439011";
    const userB = "507f1f77bcf86cd799439012";
    const investments = [
      {
        id: "1",
        userId: userA,
        fundId: "aggressive-alpha",
        subscribedAt: new Date("2024-01-01"),
        status: InvestmentStatus.matured,
        projectedPayoutUsdt: 35,
      },
      {
        id: "2",
        userId: userA,
        fundId: "capital-shield",
        subscribedAt: new Date("2024-02-28"),
        status: InvestmentStatus.matured,
        projectedPayoutUsdt: 26.5,
      },
      {
        id: "3",
        userId: userB,
        fundId: "stable-yield",
        subscribedAt: new Date("2024-01-30"),
        status: InvestmentStatus.matured,
        projectedPayoutUsdt: 27.5,
      },
    ] as Parameters<typeof buildGlobalQueue>[0];

    const queue = buildGlobalQueue(investments);
    assert.equal(queue[0].fundId, "stable-yield");
    assert.equal(queue[1].fundId, "capital-shield");
  });
});

describe("revenueEngine pool", () => {
  it("canFundFromPool: surplus covers shortfall", () => {
    const poolMin = 75;
    const poolAvailable = 50;
    const treasurySurplus = 25;
    const result = canFundFromPool(poolAvailable, poolMin, treasurySurplus);
    assert.equal(result.ok, true);
    assert.equal(result.fromSurplus, liquidityShortfall(poolAvailable, poolMin));
  });

  it("canFundFromPool: pool alone sufficient", () => {
    const head = {
      projectedPayoutUsdt: 35,
    } as Parameters<typeof getPoolMin>[1];
    const poolMin = getPoolMin(75, head, 0);
    assert.ok(75 >= poolMin);
    const result = canFundFromPool(75, poolMin, 0);
    assert.equal(result.ok, true);
    assert.equal(result.fromSurplus, 0);
  });
});

describe("revenueEngine ledger integration", () => {
  it(
    "recordSubscribeInflow updates pool and creates event",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Ledger Test",
          email: `ledger-${Date.now()}@example.com`,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: `T${Date.now()}ledgertestaddress123456789`,
          privateKey: "test-key",
        },
      });

      const ledgerBefore = await prisma.treasuryLedger.upsert({
        where: { id: GLOBAL_LEDGER_ID },
        create: { id: GLOBAL_LEDGER_ID },
        update: {},
      });

      const order = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth-partners",
          costUsdt: INVESTMENT_AMOUNT_USDT(),
          reservedUsdt: INVESTMENT_AMOUNT_USDT(),
          status: PurchaseOrderStatus.completed,
          usdtTxId: `test-tx-${Date.now()}`,
        },
      });

      const investment = await prisma.investment.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth-partners",
          amountUsdt: INVESTMENT_AMOUNT_USDT(),
          returnPercent90d: 20,
          projectedPayoutUsdt: 30,
          status: InvestmentStatus.active,
          purchaseOrderId: order.id,
          subscribedAt: new Date(),
        },
      });

      try {
        await recordSubscribeInflow(investment);
        await recordSubscribeInflow(investment);

        const after = await prisma.treasuryLedger.findUnique({
          where: { id: GLOBAL_LEDGER_ID },
        });
        assert.equal(
          roundUsdt((after?.poolAvailable ?? 0) - ledgerBefore.poolAvailable),
          INVESTMENT_AMOUNT_USDT()
        );
        const eventCount = await prisma.treasuryEvent.count({
          where: {
            investmentId: investment.id,
            type: TreasuryEventType.subscribe_inflow,
          },
        });
        assert.equal(eventCount, 1);

        const updatedOrder = await prisma.purchaseOrder.findUnique({
          where: { id: order.id },
          select: { subscribeInflowRecordedAt: true },
        });
        assert.ok(updatedOrder?.subscribeInflowRecordedAt);
      } finally {
        await prisma.treasuryEvent.deleteMany({
          where: { investmentId: investment.id },
        });
        await prisma.investment.delete({ where: { id: investment.id } });
        await prisma.purchaseOrder.delete({ where: { id: order.id } });
        await prisma.wallet.delete({ where: { id: wallet.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.treasuryLedger.update({
          where: { id: GLOBAL_LEDGER_ID },
          data: {
            poolAvailable: ledgerBefore.poolAvailable,
            treasurySurplus: ledgerBefore.treasurySurplus,
            protectedRevenueCredited: ledgerBefore.protectedRevenueCredited,
            protectedRevenueWithdrawn: ledgerBefore.protectedRevenueWithdrawn,
            subscriberSlotsCredited: ledgerBefore.subscriberSlotsCredited,
            subscriberSlotsConsumed: ledgerBefore.subscriberSlotsConsumed,
            version: ledgerBefore.version,
          },
        });
      }
    }
  );

  it(
    "recordSubscribeInflow credits pool and surplus per investment for same user",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Multi Fund User",
          email: `multi-fund-${Date.now()}@example.com`,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Main",
          address: `T${Date.now()}multifundwalletaddress123456`,
          privateKey: "test-key",
          isMainWallet: true,
        },
      });

      const ledgerBefore = await prisma.treasuryLedger.upsert({
        where: { id: GLOBAL_LEDGER_ID },
        create: { id: GLOBAL_LEDGER_ID },
        update: {},
      });

      const investments = [];
      try {
        for (let i = 0; i < 3; i++) {
          const order = await prisma.purchaseOrder.create({
            data: {
              userId: user.id,
              walletId: wallet.id,
              fundId: "growth-partners",
              costUsdt: INVESTMENT_AMOUNT_USDT(),
              reservedUsdt: INVESTMENT_AMOUNT_USDT(),
              status: PurchaseOrderStatus.completed,
              usdtTxId: `test-tx-${Date.now()}-${i}`,
            },
          });
          const investment = await prisma.investment.create({
            data: {
              userId: user.id,
              walletId: wallet.id,
              fundId: "growth-partners",
              amountUsdt: INVESTMENT_AMOUNT_USDT(),
              returnPercent90d: 20,
              projectedPayoutUsdt: 30,
              status: InvestmentStatus.active,
              purchaseOrderId: order.id,
              subscribedAt: new Date(),
            },
          });
          await recordSubscribeInflow(investment);
          investments.push({ investment, order });
        }

        const after = await prisma.treasuryLedger.findUnique({
          where: { id: GLOBAL_LEDGER_ID },
        });
        assert.equal(
          roundUsdt((after?.poolAvailable ?? 0) - ledgerBefore.poolAvailable),
          roundUsdt(3 * INVESTMENT_AMOUNT_USDT())
        );
        assert.ok(
          (after?.treasurySurplus ?? 0) > ledgerBefore.treasurySurplus
        );
      } finally {
        for (const row of investments) {
          await prisma.treasuryEvent.deleteMany({
            where: { investmentId: row.investment.id },
          });
          await prisma.investment.delete({ where: { id: row.investment.id } });
          await prisma.purchaseOrder.delete({ where: { id: row.order.id } });
        }
        await prisma.wallet.delete({ where: { id: wallet.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.treasuryLedger.update({
          where: { id: GLOBAL_LEDGER_ID },
          data: {
            poolAvailable: ledgerBefore.poolAvailable,
            treasurySurplus: ledgerBefore.treasurySurplus,
            protectedRevenueCredited: ledgerBefore.protectedRevenueCredited,
            protectedRevenueWithdrawn: ledgerBefore.protectedRevenueWithdrawn,
            subscriberSlotsCredited: ledgerBefore.subscriberSlotsCredited,
            subscriberSlotsConsumed: ledgerBefore.subscriberSlotsConsumed,
            version: ledgerBefore.version,
          },
        });
      }
    }
  );

  it(
    "recordSubscribeInflow creates one event for concurrent retries",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Concurrent Ledger Test",
          email: `ledger-concurrent-${Date.now()}@example.com`,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: `T${Date.now()}ledgerconcurrent12345678`,
          privateKey: "test-key",
        },
      });

      const ledgerBefore = await prisma.treasuryLedger.upsert({
        where: { id: GLOBAL_LEDGER_ID },
        create: { id: GLOBAL_LEDGER_ID },
        update: {},
      });

      const order = await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth-partners",
          costUsdt: INVESTMENT_AMOUNT_USDT(),
          reservedUsdt: INVESTMENT_AMOUNT_USDT(),
          status: PurchaseOrderStatus.completed,
          usdtTxId: `test-concurrent-tx-${Date.now()}`,
        },
      });

      const investment = await prisma.investment.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth-partners",
          amountUsdt: INVESTMENT_AMOUNT_USDT(),
          returnPercent90d: 20,
          projectedPayoutUsdt: 30,
          status: InvestmentStatus.active,
          purchaseOrderId: order.id,
          subscribedAt: new Date(),
        },
      });

      try {
        await Promise.all(
          Array.from({ length: 5 }, () => recordSubscribeInflow(investment))
        );

        const after = await prisma.treasuryLedger.findUnique({
          where: { id: GLOBAL_LEDGER_ID },
        });
        assert.equal(
          roundUsdt((after?.poolAvailable ?? 0) - ledgerBefore.poolAvailable),
          INVESTMENT_AMOUNT_USDT()
        );
        const eventCount = await prisma.treasuryEvent.count({
          where: {
            investmentId: investment.id,
            type: TreasuryEventType.subscribe_inflow,
          },
        });
        assert.equal(eventCount, 1);

        const updatedOrder = await prisma.purchaseOrder.findUnique({
          where: { id: order.id },
          select: { subscribeInflowRecordedAt: true },
        });
        assert.ok(updatedOrder?.subscribeInflowRecordedAt);
      } finally {
        await prisma.treasuryEvent.deleteMany({
          where: { investmentId: investment.id },
        });
        await prisma.investment.delete({ where: { id: investment.id } });
        await prisma.purchaseOrder.delete({ where: { id: order.id } });
        await prisma.wallet.delete({ where: { id: wallet.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.treasuryLedger.update({
          where: { id: GLOBAL_LEDGER_ID },
          data: {
            poolAvailable: ledgerBefore.poolAvailable,
            treasurySurplus: ledgerBefore.treasurySurplus,
            protectedRevenueCredited: ledgerBefore.protectedRevenueCredited,
            protectedRevenueWithdrawn: ledgerBefore.protectedRevenueWithdrawn,
            subscriberSlotsCredited: ledgerBefore.subscriberSlotsCredited,
            subscriberSlotsConsumed: ledgerBefore.subscriberSlotsConsumed,
            version: ledgerBefore.version,
          },
        });
      }
    }
  );

  it(
    "evaluateAll marks queue head payable when pool and eligibility allow",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Eval Test",
          email: `eval-${Date.now()}@example.com`,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: `T${Date.now()}evaltestaddress1234567890`,
          privateKey: "test-key",
        },
      });

      const pastEligible = new Date(Date.now() - 86_400_000);

      const investment = await prisma.investment.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "capital-shield",
          amountUsdt: 25,
          returnPercent90d: 6,
          projectedPayoutUsdt: 26.5,
          status: InvestmentStatus.matured,
          subscribedAt: new Date("2020-01-01"),
          maturesAt: new Date("2020-04-01"),
          payoutEligibleAt: pastEligible,
          payabilityStatus: InvestmentPayabilityStatus.pending_liquidity,
        },
      });

      await prisma.treasuryLedger.upsert({
        where: { id: GLOBAL_LEDGER_ID },
        create: {
          id: GLOBAL_LEDGER_ID,
          poolAvailable: 100,
        },
        update: { poolAvailable: 100 },
      });

      await evaluateAll();

      const updated = await prisma.investment.findUnique({
        where: { id: investment.id },
      });
      assert.equal(updated?.payabilityStatus, InvestmentPayabilityStatus.payable);
      assert.equal(updated?.globalQueueRank, 1);

      await prisma.investment.delete({ where: { id: investment.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );

  it(
    "onRedeemCompleted decrements pool and may credit surplus",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Redeem Ledger Test",
          email: `redeem-ledger-${Date.now()}@example.com`,
        },
      });
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: `T${Date.now()}redeemledger123456789012`,
          privateKey: "test-key",
        },
      });

      const investment = await prisma.investment.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "capital-shield",
          amountUsdt: 25,
          returnPercent90d: 6,
          projectedPayoutUsdt: 26.5,
          status: InvestmentStatus.redeemed,
          subscribedAt: new Date("2020-01-01"),
          redeemedAt: new Date(),
        },
      });

      await prisma.treasuryLedger.upsert({
        where: { id: GLOBAL_LEDGER_ID },
        create: {
          id: GLOBAL_LEDGER_ID,
          poolAvailable: 100,
          treasurySurplus: 0,
        },
        update: { poolAvailable: 100, treasurySurplus: 0 },
      });

      await onRedeemCompleted(investment);

      const ledger = await prisma.treasuryLedger.findUnique({
        where: { id: GLOBAL_LEDGER_ID },
      });
      assert.equal(ledger?.poolAvailable, 73.5);

      const outflow = await prisma.treasuryEvent.findFirst({
        where: {
          investmentId: investment.id,
          type: TreasuryEventType.payout_outflow,
        },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(outflow);

      await prisma.treasuryEvent.deleteMany({
        where: { investmentId: investment.id },
      });
      await prisma.investment.delete({ where: { id: investment.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
