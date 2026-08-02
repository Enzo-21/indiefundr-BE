export type PlayerPowerGrants = {
  referral_recovery: number;
  term_extension: number;
  boost: number;
};

export type PlayerLevelPerks = {
  slotsPerFund: number;
  maxTotalOpenInvestments: number;
  unlimitedSlotsPerFund?: boolean;
  unlimitedTotalOpenInvestments?: boolean;
  powerGrants: PlayerPowerGrants;
};

export type PlayerLevelDefinition = {
  level: number;
  title: string;
  subtitle: string;
  requirements: string[];
  benefits: string[];
  perks: PlayerLevelPerks;
};

export const PLAYER_LEVELS: PlayerLevelDefinition[] = [
  {
    level: 0,
    title: "Starter",
    subtitle: "Learn the basics of investing",
    requirements: ["Create your account"],
    benefits: [
      "1 open slot per fund",
      "Up to 3 open investments across all funds",
      "Access to every fund in the catalog",
      "1 Recovery Invite power card",
      "1 Extra Time power card",
      "1 Boost power card",
    ],
    perks: {
      slotsPerFund: 1,
      maxTotalOpenInvestments: 3,
      powerGrants: { referral_recovery: 1, term_extension: 1, boost: 1 },
    },
  },
  {
    level: 1,
    title: "Builder",
    subtitle: "Your first investments are live",
    requirements: [
      "Complete at least 1 investment (paid or recovered)",
      "Make at least 3 lifetime investments",
    ],
    benefits: [
      "2 open slots per fund",
      "Up to 5 open investments across all funds",
      "+2 Recovery Invite power cards",
      "+1 Extra Time power card",
      "+2 Boost power cards",
    ],
    perks: {
      slotsPerFund: 2,
      maxTotalOpenInvestments: 5,
      powerGrants: { referral_recovery: 2, term_extension: 1, boost: 2 },
    },
  },
  {
    level: 2,
    title: "Investor",
    subtitle: "Growing a diversified portfolio",
    requirements: [
      "Hold investments in at least 2 different funds",
      "Complete 3 successful investments",
    ],
    benefits: [
      "2 open slots per fund",
      "Up to 8 open investments across all funds",
      "+3 Recovery Invite power cards",
      "+3 Extra Time power cards",
      "+3 Boost power cards",
    ],
    perks: {
      slotsPerFund: 2,
      maxTotalOpenInvestments: 8,
      powerGrants: { referral_recovery: 3, term_extension: 3, boost: 3 },
    },
  },
  {
    level: 3,
    title: "Strategist",
    subtitle: "Managing multiple positions with confidence",
    requirements: [
      "Redeem at least one matured investment",
      "Maintain 5+ completed investments lifetime",
    ],
    benefits: [
      "3 open slots per fund",
      "Up to 12 open investments across all funds",
      "+4 Recovery Invite power cards",
      "+4 Extra Time power cards",
      "+4 Boost power cards",
    ],
    perks: {
      slotsPerFund: 3,
      maxTotalOpenInvestments: 12,
      powerGrants: { referral_recovery: 4, term_extension: 4, boost: 4 },
    },
  },
  {
    level: 4,
    title: "Master",
    subtitle: "Maximum flexibility across the platform",
    requirements: [
      "Invite a friend who completes their first investment",
    ],
    benefits: [
      "Up to 5 open slots per fund (fund catalog maximum)",
      "Up to 20 open investments across all funds",
      "+5 Recovery Invite power cards",
      "+5 Extra Time power cards",
      "+5 Boost power cards",
    ],
    perks: {
      slotsPerFund: 5,
      maxTotalOpenInvestments: 20,
      powerGrants: { referral_recovery: 5, term_extension: 5, boost: 5 },
    },
  },
  {
    level: 5,
    title: "Elite",
    subtitle: "Unlimited capacity for top investors",
    requirements: [
      "Hold investments in at least 4 different funds",
      "Complete 10+ successful investments lifetime",
      "Invite 3 friends who qualify for referral rewards (both invested)",
    ],
    benefits: [
      "Unlimited open slots per fund",
      "Unlimited open investments across all funds",
      "+7 Recovery Invite power cards",
      "+7 Extra Time power cards",
      "+7 Boost power cards",
      "Priority access to new funds and features",
    ],
    perks: {
      slotsPerFund: 5,
      maxTotalOpenInvestments: 20,
      unlimitedSlotsPerFund: true,
      unlimitedTotalOpenInvestments: true,
      powerGrants: { referral_recovery: 7, term_extension: 7, boost: 7 },
    },
  },
];

const MAX_DEFINED_LEVEL = PLAYER_LEVELS[PLAYER_LEVELS.length - 1]?.level ?? 0;

export const PLAYER_POWER_TYPES = [
  "referral_recovery",
  "term_extension",
  "boost",
] as const;

export type PlayerPowerType = (typeof PLAYER_POWER_TYPES)[number];

export function normalizePlayerLevel(level: number | null | undefined): number {
  if (typeof level !== "number" || !Number.isFinite(level) || level < 0) {
    return 0;
  }
  return Math.min(Math.floor(level), MAX_DEFINED_LEVEL);
}

export function getPlayerLevelDefinition(
  level: number | null | undefined
): PlayerLevelDefinition {
  const normalized = normalizePlayerLevel(level);
  return (
    PLAYER_LEVELS.find((entry) => entry.level === normalized) ?? PLAYER_LEVELS[0]
  );
}

export function getPlayerLevelPerks(
  level: number | null | undefined
): PlayerLevelPerks {
  return getPlayerLevelDefinition(level).perks;
}

export function getPowerGrantsForLevel(
  level: number | null | undefined
): PlayerPowerGrants {
  return getPlayerLevelDefinition(level).perks.powerGrants;
}

export function getCumulativePowerGrants(
  userLevel: number | null | undefined
): PlayerPowerGrants {
  const normalized = normalizePlayerLevel(userLevel);
  const totals: PlayerPowerGrants = {
    referral_recovery: 0,
    term_extension: 0,
    boost: 0,
  };
  for (const entry of PLAYER_LEVELS) {
    if (entry.level > normalized) break;
    totals.referral_recovery += entry.perks.powerGrants.referral_recovery;
    totals.term_extension += entry.perks.powerGrants.term_extension;
    totals.boost += entry.perks.powerGrants.boost;
  }
  return totals;
}

export function hasUnlimitedSlotsPerFund(
  perks: Pick<PlayerLevelPerks, "slotsPerFund" | "unlimitedSlotsPerFund">
): boolean {
  return perks.unlimitedSlotsPerFund === true;
}

export function hasUnlimitedTotalOpenInvestments(
  perks: Pick<PlayerLevelPerks, "maxTotalOpenInvestments" | "unlimitedTotalOpenInvestments">
): boolean {
  return perks.unlimitedTotalOpenInvestments === true;
}

export function getEffectiveMaxTotalOpenInvestments(
  level: number | null | undefined
): number {
  const perks = getPlayerLevelPerks(level);
  if (hasUnlimitedTotalOpenInvestments(perks)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return perks.maxTotalOpenInvestments;
}

export function getEffectiveSlotsPerFund(
  level: number | null | undefined,
  fundCatalogMax: number
): number {
  const perks = getPlayerLevelPerks(level);
  const catalogMax =
    typeof fundCatalogMax === "number" && fundCatalogMax > 0
      ? Math.floor(fundCatalogMax)
      : 1;
  if (hasUnlimitedSlotsPerFund(perks)) {
    return catalogMax;
  }
  return Math.min(perks.slotsPerFund, catalogMax);
}
