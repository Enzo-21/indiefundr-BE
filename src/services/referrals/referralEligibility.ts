import { InvestmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const INVESTOR_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.active,
  InvestmentStatus.matured,
  InvestmentStatus.redeeming,
  InvestmentStatus.redeemed,
  InvestmentStatus.referral_recovered,
];

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export async function hasCompletedFirstInvestment(userId: string): Promise<boolean> {
  const count = await prisma.investment.count({
    where: {
      userId,
      status: { in: INVESTOR_STATUSES },
    },
  });
  return count > 0;
}

export async function canEarnInviterRewards(userId: string): Promise<boolean> {
  return hasCompletedFirstInvestment(userId);
}

export async function isFirstCompletedInvestment(
  userId: string,
  investmentId: string
): Promise<boolean> {
  const investment = await prisma.investment.findFirst({
    where: {
      userId,
      status: { in: INVESTOR_STATUSES },
    },
    orderBy: [{ subscribedAt: "asc" }, { date: "asc" }],
    select: { id: true },
  });
  return investment?.id === investmentId;
}
