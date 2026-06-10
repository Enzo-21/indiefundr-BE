import { getInvestmentTermApproxDays } from "./investmentTiming";

export type InvestmentFund = {
  id: string;
  name: string;
  tagline: string;
  returnPercent90d: number;
  termDays: number;
  maxOpenInvestments: number;
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
    name: "High Roller Syndicate",
    tagline: "Table games, sports books, and pro players",
    returnPercent90d: 40,
    riskLevel: "high",
    riskLabel: "High risk",
    destinations: [
      "Pro poker & tournament pros",
      "Blackjack & baccarat teams",
      "Casino advantage players",
      "Sports betting syndicates",
    ],
    accentColor: "#c0392b",
    icon: "dice",
    maxOpenInvestments: 5,
  },
  {
    id: "growth-partners",
    name: "Arbitrage Circuit",
    tagline: "Fast-moving edges across markets",
    returnPercent90d: 25,
    riskLevel: "medium_high",
    riskLabel: "Medium-high risk",
    destinations: [
      "Crypto CEX/DEX arbitrage",
      "Prediction market traders",
      "CS2 & game skin flippers",
      "Meme-coin momentum desks",
    ],
    accentColor: "#d35400",
    icon: "bolt",
    maxOpenInvestments: 5,
  },
  {
    id: "balanced-growth",
    name: "Hustle Collective",
    tagline: "Unconventional operators, shared upside",
    returnPercent90d: 15,
    riskLevel: "medium",
    riskLabel: "Medium risk",
    destinations: [
      "Indie game publishers",
      "Copy-trading & tipster pools",
      "Launch promo & referral farms",
      "Micro-bet strategy groups",
    ],
    accentColor: "#2980b9",
    icon: "users",
    maxOpenInvestments: 5,
  },
  {
    id: "stable-yield",
    name: "Bonus & Promo Lane",
    tagline: "Lower-variance grind strategies",
    returnPercent90d: 10,
    riskLevel: "low",
    riskLabel: "Low risk",
    destinations: [
      "Bank signup bonus runs",
      "Credit card reward stacking",
      "Cashback & coupon arbitrage",
      "App referral promo chains",
    ],
    accentColor: "#27ae60",
    icon: "gift",
    maxOpenInvestments: 5,
  },
  {
    id: "capital-shield",
    name: "Matched Edge",
    tagline: "Capital parked in soft-arbitrage plays",
    returnPercent90d: 6,
    riskLevel: "low",
    riskLabel: "Low risk",
    destinations: [
      "Matched betting operators",
      "P2P promo arbitrage",
      "Stablecoin DeFi yield",
      "Short-horizon liquidity plays",
    ],
    accentColor: "#16a085",
    icon: "shield-alt",
    maxOpenInvestments: 5,
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
