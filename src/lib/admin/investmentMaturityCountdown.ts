import { InvestmentStatus } from "@prisma/client";

type MaturityCountdownInvestment = {
  status: InvestmentStatus | string;
  maturesAt: Date | string | null;
};

/** Show elapsed maturity countdown (red "ago") only for matured, unpaid investments. */
export function shouldShowInvestmentMaturityCountdown(
  inv: MaturityCountdownInvestment
): boolean {
  if (!inv.maturesAt) return false;
  return inv.status === InvestmentStatus.matured;
}
