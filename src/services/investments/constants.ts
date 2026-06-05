import { InvestmentStatus } from "@prisma/client";

export const INVESTMENT_OPEN_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.pending,
  InvestmentStatus.active,
  InvestmentStatus.matured,
  InvestmentStatus.redeeming,
];
