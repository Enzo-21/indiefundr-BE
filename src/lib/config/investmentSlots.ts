import type { Investment, Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { INVESTMENT_OPEN_STATUSES } from "@/services/investments/constants";
import { ACTIVE_PURCHASE_ORDER_STATUSES } from "@/services/wallets/walletBalance";
import { getFundById } from "./investmentFunds";
import {
  getEffectiveMaxTotalOpenInvestments,
  getEffectiveSlotsPerFund,
  getPlayerLevelPerks,
  hasUnlimitedTotalOpenInvestments,
  normalizePlayerLevel,
} from "./playerLevels";

const DEFAULT_MAX_OPEN_INVESTMENTS = 1;

export class InvestmentSlotsFullError extends Error {
  readonly code = "SLOTS_FULL" as const;
  readonly openCount: number;
  readonly maxOpenInvestments: number;

  constructor(openCount: number, maxOpenInvestments: number) {
    super(
      `Maximum open investments reached for this fund (${openCount}/${maxOpenInvestments})`
    );
    this.name = "InvestmentSlotsFullError";
    this.openCount = openCount;
    this.maxOpenInvestments = maxOpenInvestments;
  }
}

export class TotalInvestmentsCapError extends Error {
  readonly code = "TOTAL_INVESTMENTS_CAP" as const;
  readonly totalOpenCount: number;
  readonly maxTotalOpenInvestments: number;

  constructor(totalOpenCount: number, maxTotalOpenInvestments: number) {
    super(
      `Maximum open investments reached at your level (${totalOpenCount}/${maxTotalOpenInvestments})`
    );
    this.name = "TotalInvestmentsCapError";
    this.totalOpenCount = totalOpenCount;
    this.maxTotalOpenInvestments = maxTotalOpenInvestments;
  }
}

export function getMaxOpenInvestmentsForFund(fundId: string): number {
  const fund = getFundById(fundId);
  const max = fund?.maxOpenInvestments;
  if (typeof max === "number" && max > 0) {
    return Math.floor(max);
  }
  return DEFAULT_MAX_OPEN_INVESTMENTS;
}

type PrismaLike = PrismaClient | Prisma.TransactionClient;

async function resolveUserLevel(
  userId: string,
  client: PrismaLike,
  userLevel?: number
): Promise<number> {
  if (userLevel !== undefined) {
    return normalizePlayerLevel(userLevel);
  }
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { level: true },
  });
  return normalizePlayerLevel(user?.level);
}

export async function countOpenInvestmentsForUserFund(
  userId: string,
  fundId: string,
  client: PrismaLike = defaultPrisma
): Promise<number> {
  return client.investment.count({
    where: {
      userId,
      fundId,
      status: { in: INVESTMENT_OPEN_STATUSES },
    },
  });
}

export async function countOpenInvestmentsForUser(
  userId: string,
  client: PrismaLike = defaultPrisma
): Promise<number> {
  return client.investment.count({
    where: {
      userId,
      status: { in: INVESTMENT_OPEN_STATUSES },
    },
  });
}

/** Active purchase orders not yet represented by an open investment row. */
export async function countUnrepresentedActivePurchaseOrdersForUserFund(
  userId: string,
  fundId: string,
  client: PrismaLike = defaultPrisma
): Promise<number> {
  const [activeOrders, linkedInvestments] = await Promise.all([
    client.purchaseOrder.findMany({
      where: {
        userId,
        fundId,
        status: { in: ACTIVE_PURCHASE_ORDER_STATUSES },
      },
      select: { id: true },
    }),
    client.investment.findMany({
      where: {
        userId,
        fundId,
        status: { in: INVESTMENT_OPEN_STATUSES },
        purchaseOrderId: { not: null },
      },
      select: { purchaseOrderId: true },
    }),
  ]);

  const linkedOrderIds = new Set(
    linkedInvestments
      .map((inv) => inv.purchaseOrderId)
      .filter((id): id is string => Boolean(id))
  );

  return activeOrders.filter((order) => !linkedOrderIds.has(order.id)).length;
}

export async function countUnrepresentedActivePurchaseOrdersForUser(
  userId: string,
  client: PrismaLike = defaultPrisma
): Promise<number> {
  const [activeOrders, linkedInvestments] = await Promise.all([
    client.purchaseOrder.findMany({
      where: {
        userId,
        status: { in: ACTIVE_PURCHASE_ORDER_STATUSES },
      },
      select: { id: true },
    }),
    client.investment.findMany({
      where: {
        userId,
        status: { in: INVESTMENT_OPEN_STATUSES },
        purchaseOrderId: { not: null },
      },
      select: { purchaseOrderId: true },
    }),
  ]);

  const linkedOrderIds = new Set(
    linkedInvestments
      .map((inv) => inv.purchaseOrderId)
      .filter((id): id is string => Boolean(id))
  );

  return activeOrders.filter((order) => !linkedOrderIds.has(order.id)).length;
}

export async function getTotalInvestmentUsage(
  userId: string,
  client: PrismaLike = defaultPrisma,
  userLevel?: number
): Promise<{
  totalOpenCount: number;
  maxTotalOpenInvestments: number;
  totalSlotsAvailable: number;
}> {
  const level = await resolveUserLevel(userId, client, userLevel);
  const perks = getPlayerLevelPerks(level);
  const maxTotalOpenInvestments = getEffectiveMaxTotalOpenInvestments(level);
  const [investmentCount, processingOrderCount] = await Promise.all([
    countOpenInvestmentsForUser(userId, client),
    countUnrepresentedActivePurchaseOrdersForUser(userId, client),
  ]);
  const totalOpenCount = investmentCount + processingOrderCount;
  const unlimitedTotal = hasUnlimitedTotalOpenInvestments(perks);
  return {
    totalOpenCount,
    maxTotalOpenInvestments: unlimitedTotal
      ? perks.maxTotalOpenInvestments
      : maxTotalOpenInvestments,
    totalSlotsAvailable: unlimitedTotal
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, maxTotalOpenInvestments - totalOpenCount),
  };
}

export async function getInvestmentSlotUsage(
  userId: string,
  fundId: string,
  client: PrismaLike = defaultPrisma,
  userLevel?: number
): Promise<{
  openCount: number;
  maxOpenInvestments: number;
  slotsAvailable: number;
  totalOpenCount: number;
  maxTotalOpenInvestments: number;
  totalSlotsAvailable: number;
}> {
  const level = await resolveUserLevel(userId, client, userLevel);
  const catalogMax = getMaxOpenInvestmentsForFund(fundId);
  const maxOpenInvestments = getEffectiveSlotsPerFund(level, catalogMax);
  const [investmentCount, processingOrderCount, totalUsage] = await Promise.all([
    countOpenInvestmentsForUserFund(userId, fundId, client),
    countUnrepresentedActivePurchaseOrdersForUserFund(userId, fundId, client),
    getTotalInvestmentUsage(userId, client, level),
  ]);
  const openCount = investmentCount + processingOrderCount;
  const perFundAvailable = Math.max(0, maxOpenInvestments - openCount);
  const slotsAvailable = Math.min(
    perFundAvailable,
    totalUsage.totalSlotsAvailable
  );
  return {
    openCount,
    maxOpenInvestments,
    slotsAvailable,
    totalOpenCount: totalUsage.totalOpenCount,
    maxTotalOpenInvestments: totalUsage.maxTotalOpenInvestments,
    totalSlotsAvailable: totalUsage.totalSlotsAvailable,
  };
}

export async function assertTotalOpenInvestmentCapacity(
  userId: string,
  client: PrismaLike = defaultPrisma,
  userLevel?: number
): Promise<void> {
  const { totalOpenCount, maxTotalOpenInvestments } =
    await getTotalInvestmentUsage(userId, client, userLevel);
  const level = await resolveUserLevel(userId, client, userLevel);
  if (hasUnlimitedTotalOpenInvestments(getPlayerLevelPerks(level))) {
    return;
  }
  if (totalOpenCount >= maxTotalOpenInvestments) {
    throw new TotalInvestmentsCapError(
      totalOpenCount,
      maxTotalOpenInvestments
    );
  }
}

export async function assertCanOpenInvestment(
  userId: string,
  fundId: string,
  client: PrismaLike = defaultPrisma,
  userLevel?: number
): Promise<void> {
  const level = await resolveUserLevel(userId, client, userLevel);
  await assertTotalOpenInvestmentCapacity(userId, client, level);
  const { openCount, maxOpenInvestments } = await getInvestmentSlotUsage(
    userId,
    fundId,
    client,
    level
  );
  if (openCount >= maxOpenInvestments) {
    throw new InvestmentSlotsFullError(openCount, maxOpenInvestments);
  }
}

export function slotsFullResponseBody(
  openCount: number,
  maxOpenInvestments: number
): Record<string, unknown> {
  return {
    code: "SLOTS_FULL",
    msg: `You have reached the maximum of ${maxOpenInvestments} open investments in this fund`,
    openCount,
    maxOpenInvestments,
  };
}

export function totalInvestmentsCapResponseBody(
  totalOpenCount: number,
  maxTotalOpenInvestments: number
): Record<string, unknown> {
  return {
    code: "TOTAL_INVESTMENTS_CAP",
    msg: `You have reached the maximum of ${maxTotalOpenInvestments} open investments at your level`,
    totalOpenCount,
    maxTotalOpenInvestments,
  };
}

export async function createInvestmentIfSlotAvailable(
  data: Prisma.InvestmentUncheckedCreateInput
): Promise<Investment> {
  const { userId, fundId } = data;
  if (!userId || !fundId) {
    throw new Error("userId and fundId are required to create an investment");
  }

  return defaultPrisma.$transaction(async (tx) => {
    await assertCanOpenInvestment(userId, fundId, tx);
    return tx.investment.create({ data });
  });
}
