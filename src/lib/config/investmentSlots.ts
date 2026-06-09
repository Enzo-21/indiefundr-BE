import type { Investment, Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { INVESTMENT_OPEN_STATUSES } from "@/services/investments/constants";
import { getFundById } from "./investmentFunds";

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

export function getMaxOpenInvestmentsForFund(fundId: string): number {
  const fund = getFundById(fundId);
  const max = fund?.maxOpenInvestments;
  if (typeof max === "number" && max > 0) {
    return Math.floor(max);
  }
  return DEFAULT_MAX_OPEN_INVESTMENTS;
}

type PrismaLike = PrismaClient | Prisma.TransactionClient;

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

export async function getInvestmentSlotUsage(
  userId: string,
  fundId: string,
  client: PrismaLike = defaultPrisma
): Promise<{
  openCount: number;
  maxOpenInvestments: number;
  slotsAvailable: number;
}> {
  const maxOpenInvestments = getMaxOpenInvestmentsForFund(fundId);
  const openCount = await countOpenInvestmentsForUserFund(userId, fundId, client);
  return {
    openCount,
    maxOpenInvestments,
    slotsAvailable: Math.max(0, maxOpenInvestments - openCount),
  };
}

export async function assertCanOpenInvestment(
  userId: string,
  fundId: string,
  client: PrismaLike = defaultPrisma
): Promise<void> {
  const { openCount, maxOpenInvestments } = await getInvestmentSlotUsage(
    userId,
    fundId,
    client
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
