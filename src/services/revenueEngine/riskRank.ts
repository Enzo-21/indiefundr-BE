import { getFundById } from "@/lib/config/investmentFunds";

const FUND_RISK_RANK: Record<string, number> = {
  "capital-shield": 1,
  "stable-yield": 2,
  "balanced-growth": 3,
  "growth-partners": 4,
  "aggressive-alpha": 5,
};

export function riskRank(fundId: string): number {
  if (FUND_RISK_RANK[fundId] != null) return FUND_RISK_RANK[fundId];
  const fund = getFundById(fundId);
  const level = fund?.riskLevel;
  if (level === "low") return 2;
  if (level === "medium") return 3;
  if (level === "medium_high") return 4;
  return 5;
}
