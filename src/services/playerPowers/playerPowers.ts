import {
  PlayerPowerType,
  Prisma,
  UnpaidMaturityResolution,
  type PrismaClient,
} from "@prisma/client";
import {
  getCumulativePowerGrants,
  normalizePlayerLevel,
  PLAYER_POWER_TYPES,
  type PlayerPowerType as ConfigPlayerPowerType,
} from "@/lib/config/playerLevels";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type PowerInventoryEntry = {
  granted: number;
  used: number;
  available: number;
};

export type PowerInventory = Record<ConfigPlayerPowerType, PowerInventoryEntry>;

export type PlayerPowerCardPayload = {
  type: ConfigPlayerPowerType;
  title: string;
  description: string;
  granted: number;
  used: number;
  available: number;
};

export const PLAYER_POWER_CARD_COPY: Record<
  ConfigPlayerPowerType,
  { title: string; description: string }
> = {
  referral_recovery: {
    title: "Recovery Invite",
    description:
      "Invite 2 friends to recover 25 USDT principal on an unpaid maturity",
  },
  term_extension: {
    title: "Extra Time",
    description: "Wait up to half the fund term for the expected return",
  },
};

export class PlayerPowerUnavailableError extends Error {
  readonly code = "power_unavailable" as const;
  readonly powerType: ConfigPlayerPowerType;

  constructor(powerType: ConfigPlayerPowerType) {
    super(`No ${powerType} power cards available`);
    this.name = "PlayerPowerUnavailableError";
    this.powerType = powerType;
  }
}

type DbClient = PrismaClient | Prisma.TransactionClient;

function emptyInventoryEntry(): PowerInventoryEntry {
  return { granted: 0, used: 0, available: 0 };
}

function toConfigPowerType(
  powerType: PlayerPowerType | UnpaidMaturityResolution
): ConfigPlayerPowerType {
  if (powerType === "referral_recovery" || powerType === "term_extension") {
    return powerType;
  }
  throw new Error(`Unknown power type: ${powerType}`);
}

function toPrismaPowerType(
  powerType: ConfigPlayerPowerType | UnpaidMaturityResolution
): PlayerPowerType {
  if (powerType === "referral_recovery") {
    return PlayerPowerType.referral_recovery;
  }
  if (powerType === "term_extension") {
    return PlayerPowerType.term_extension;
  }
  throw new Error(`Unknown power type: ${powerType}`);
}

export function buildPowerInventory(
  userLevel: number | null | undefined,
  usedByType: Partial<Record<ConfigPlayerPowerType, number>>
): PowerInventory {
  const granted = getCumulativePowerGrants(userLevel);
  const inventory = {
    referral_recovery: emptyInventoryEntry(),
    term_extension: emptyInventoryEntry(),
  } satisfies PowerInventory;

  for (const type of PLAYER_POWER_TYPES) {
    const used = usedByType[type] ?? 0;
    const totalGranted = granted[type];
    inventory[type] = {
      granted: totalGranted,
      used,
      available: Math.max(0, totalGranted - used),
    };
  }

  return inventory;
}

export async function countPowerUsesByType(
  userId: string,
  db: DbClient = defaultPrisma
): Promise<Record<ConfigPlayerPowerType, number>> {
  const grouped = await db.playerPowerUse.groupBy({
    by: ["powerType"],
    where: { userId },
    _count: { _all: true },
  });

  const used: Record<ConfigPlayerPowerType, number> = {
    referral_recovery: 0,
    term_extension: 0,
  };

  for (const row of grouped) {
    used[toConfigPowerType(row.powerType)] = row._count._all;
  }

  return used;
}

export async function getPowerInventory(
  userId: string,
  userLevel: number | null | undefined,
  db: DbClient = defaultPrisma
): Promise<PowerInventory> {
  const usedByType = await countPowerUsesByType(userId, db);
  return buildPowerInventory(userLevel, usedByType);
}

export function serializePowerCards(inventory: PowerInventory): PlayerPowerCardPayload[] {
  return PLAYER_POWER_TYPES.map((type) => ({
    type,
    ...PLAYER_POWER_CARD_COPY[type],
    ...inventory[type],
  }));
}

export async function assertPowerAvailable(
  userId: string,
  userLevel: number | null | undefined,
  powerType: ConfigPlayerPowerType | UnpaidMaturityResolution,
  db: DbClient = defaultPrisma
): Promise<void> {
  const inventory = await getPowerInventory(userId, userLevel, db);
  const key = toConfigPowerType(powerType);
  if (inventory[key].available <= 0) {
    throw new PlayerPowerUnavailableError(key);
  }
}

export async function consumePowerForInvestment(
  db: DbClient,
  params: {
    userId: string;
    userLevel: number | null | undefined;
    investmentId: string;
    powerType: ConfigPlayerPowerType | UnpaidMaturityResolution;
    consumedAt?: Date;
  }
): Promise<void> {
  const key = toConfigPowerType(params.powerType);
  await assertPowerAvailable(params.userId, params.userLevel, key, db);

  await db.playerPowerUse.create({
    data: {
      userId: params.userId,
      investmentId: params.investmentId,
      powerType: toPrismaPowerType(params.powerType),
      userLevel: normalizePlayerLevel(params.userLevel),
      consumedAt: params.consumedAt ?? new Date(),
    },
  });
}

export async function backfillPlayerPowerUses(
  db: DbClient = defaultPrisma
): Promise<{ created: number; skipped: number }> {
  const investments = await db.investment.findMany({
    where: { unpaidMaturityResolution: { not: null } },
    select: {
      id: true,
      userId: true,
      unpaidMaturityResolution: true,
      unpaidMaturityResolvedAt: true,
      user: { select: { level: true } },
      playerPowerUse: { select: { id: true } },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const investment of investments) {
    if (investment.playerPowerUse || !investment.unpaidMaturityResolution) {
      skipped += 1;
      continue;
    }

    await db.playerPowerUse.create({
      data: {
        userId: investment.userId,
        investmentId: investment.id,
        powerType: toPrismaPowerType(investment.unpaidMaturityResolution),
        userLevel: normalizePlayerLevel(investment.user.level),
        consumedAt: investment.unpaidMaturityResolvedAt ?? new Date(),
      },
    });
    created += 1;
  }

  return { created, skipped };
}
