import {
  WithdrawalOrderStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { ACTIVE_WITHDRAWAL_ORDER_STATUSES } from "@/services/wallets/walletBalance";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export type WithdrawalSlotUsage = {
  earned: number;
  used: number;
  available: number;
  openWithdrawals: number;
  completedWithdrawals: number;
};

/** Statuses that consume a withdrawal slot (failed does not). */
export const SLOT_CONSUMING_WITHDRAWAL_STATUSES: WithdrawalOrderStatus[] = [
  ...ACTIVE_WITHDRAWAL_ORDER_STATUSES,
  WithdrawalOrderStatus.completed,
];

export class WithdrawalSlotsEmptyError extends Error {
  readonly code = "WITHDRAWAL_SLOTS_EMPTY" as const;
  readonly earned: number;
  readonly used: number;
  readonly available: number;

  constructor(usage: Pick<WithdrawalSlotUsage, "earned" | "used" | "available">) {
    super(
      "Complete an investment to unlock a withdrawal. Each investment grants one withdrawal."
    );
    this.name = "WithdrawalSlotsEmptyError";
    this.earned = usage.earned;
    this.used = usage.used;
    this.available = usage.available;
  }
}

export function computeWithdrawalSlotUsage({
  earned,
  openWithdrawals,
  completedWithdrawals,
}: {
  earned: number;
  openWithdrawals: number;
  completedWithdrawals: number;
}): WithdrawalSlotUsage {
  const safeEarned = Math.max(0, Math.floor(earned));
  const safeOpen = Math.max(0, Math.floor(openWithdrawals));
  const safeCompleted = Math.max(0, Math.floor(completedWithdrawals));
  const used = safeOpen + safeCompleted;
  return {
    earned: safeEarned,
    used,
    available: Math.max(0, safeEarned - used),
    openWithdrawals: safeOpen,
    completedWithdrawals: safeCompleted,
  };
}

export async function getWithdrawalSlotUsage(
  userId: string,
  client: PrismaLike = defaultPrisma
): Promise<WithdrawalSlotUsage> {
  const [earned, openWithdrawals, completedWithdrawals] = await Promise.all([
    client.investment.count({
      where: { userId, subscribedAt: { not: null } },
    }),
    client.withdrawalOrder.count({
      where: {
        userId,
        status: { in: ACTIVE_WITHDRAWAL_ORDER_STATUSES },
      },
    }),
    client.withdrawalOrder.count({
      where: {
        userId,
        status: WithdrawalOrderStatus.completed,
      },
    }),
  ]);

  return computeWithdrawalSlotUsage({
    earned,
    openWithdrawals,
    completedWithdrawals,
  });
}

export async function assertCanCreateWithdrawal(
  userId: string,
  client: PrismaLike = defaultPrisma
): Promise<WithdrawalSlotUsage> {
  const usage = await getWithdrawalSlotUsage(userId, client);
  if (usage.available <= 0) {
    throw new WithdrawalSlotsEmptyError(usage);
  }
  return usage;
}
