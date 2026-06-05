import { getInvestmentTermApproxDays } from "./investmentTiming";

export type InvestmentFund = {
  id: string;
  name: string;
  tagline: string;
  returnPercent90d: number;
  termDays: number;
  riskLevel: string;
  riskLabel: string;
  destinations: string[];
  accentColor: string;
  icon: string;
};

const TERM_DAYS = getInvestmentTermApproxDays();

const FUND_DEFINITIONS: Omit<InvestmentFund, "termDays">[] = [
  {
    id: "aggressive-alpha",
    name: "Aggressive Alpha",
    tagline: "High risk, high reward over 90 days",
    returnPercent90d: 40,
    riskLevel: "high",
    riskLabel: "High risk",
    destinations: [
      "Professional poker & casino players",
      "High-variance trading desks",
      "Pre-revenue indie games",
      "Early-stage SaaS",
    ],
    accentColor: "#c0392b",
    icon: "fire",
  },
  {
    id: "growth-partners",
    name: "Growth Partners",
    tagline: "Growth-focused strategies with elevated risk",
    returnPercent90d: 25,
    riskLevel: "medium_high",
    riskLabel: "Medium-high risk",
    destinations: [
      "Indie developer SaaS",
      "Copy-trading strategies",
      "Crypto momentum funds",
      "Micro-VC seed allocations",
    ],
    accentColor: "#d35400",
    icon: "chart-line",
  },
  {
    id: "balanced-growth",
    name: "Balanced Growth",
    tagline: "Diversified growth with moderate risk",
    returnPercent90d: 15,
    riskLevel: "medium",
    riskLabel: "Medium risk",
    destinations: [
      "Diversified equity ETFs",
      "Sector rotation strategies",
      "Growth stocks",
      "Small-cap index strategies",
    ],
    accentColor: "#2980b9",
    icon: "balance-scale",
  },
  {
    id: "stable-yield",
    name: "Stable Yield",
    tagline: "Income-oriented portfolio with lower volatility",
    returnPercent90d: 10,
    riskLevel: "low",
    riskLabel: "Low risk",
    destinations: [
      "Investment-grade bonds",
      "Dividend ETFs",
      "REITs",
      "Regulated peer lending",
    ],
    accentColor: "#27ae60",
    icon: "shield-alt",
  },
  {
    id: "capital-shield",
    name: "Capital Shield",
    tagline: "Capital preservation with modest returns",
    returnPercent90d: 6,
    riskLevel: "low",
    riskLabel: "Low risk",
    destinations: [
      "Stablecoin yield",
      "Money-market instruments",
      "Short-duration treasuries",
      "Insured cash equivalents",
    ],
    accentColor: "#16a085",
    icon: "lock",
  },
];

export const INVESTMENT_FUNDS: InvestmentFund[] = FUND_DEFINITIONS.map(
  (fund) => ({
    ...fund,
    termDays: TERM_DAYS,
  })
);

export function getFundById(fundId: string): InvestmentFund | undefined {
  return INVESTMENT_FUNDS.find((f) => f.id === fundId);
}

export function isValidFundId(fundId: string): boolean {
  return Boolean(getFundById(fundId));
}
