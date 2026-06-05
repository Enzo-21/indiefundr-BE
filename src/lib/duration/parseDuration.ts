export type DurationUnit = "D" | "W" | "H" | "Mi" | "Mo";

export type ParsedDuration = {
  amount: number;
  unit: DurationUnit;
};

const DURATION_PATTERN = /^(\d+(?:\.\d+)?)\s*(D|W|H|Mi|Mo)$/i;

const UNIT_ALIASES: Record<string, DurationUnit> = {
  d: "D",
  w: "W",
  h: "H",
  mi: "Mi",
  mo: "Mo",
};

export function parseDuration(spec: string): ParsedDuration {
  const trimmed = spec.trim();
  const match = DURATION_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(
      `Invalid duration "${spec}". Use a positive number with a unit suffix: D (days), W (weeks), H (hours), Mi (minutes), Mo (months). Example: 90D, 7D, 12H, 30Mi, 3Mo.`
    );
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid duration amount in "${spec}".`);
  }

  const unitKey = match[2].toLowerCase();
  const unit = UNIT_ALIASES[unitKey];
  if (!unit) {
    throw new Error(`Unknown duration unit in "${spec}".`);
  }

  return { amount, unit };
}

export function addDuration(date: Date, spec: string): Date {
  const { amount, unit } = parseDuration(spec);
  const next = new Date(date);

  switch (unit) {
    case "D":
      next.setTime(next.getTime() + amount * 24 * 60 * 60 * 1000);
      break;
    case "W":
      next.setTime(next.getTime() + amount * 7 * 24 * 60 * 60 * 1000);
      break;
    case "H":
      next.setTime(next.getTime() + amount * 60 * 60 * 1000);
      break;
    case "Mi":
      next.setTime(next.getTime() + amount * 60 * 1000);
      break;
    case "Mo":
      next.setUTCMonth(next.getUTCMonth() + amount);
      break;
    default: {
      const _exhaustive: never = unit;
      throw new Error(`Unsupported duration unit: ${_exhaustive}`);
    }
  }

  return next;
}

export function subtractDuration(date: Date, spec: string): Date {
  const { amount, unit } = parseDuration(spec);
  const next = new Date(date);

  switch (unit) {
    case "D":
      next.setTime(next.getTime() - amount * 24 * 60 * 60 * 1000);
      break;
    case "W":
      next.setTime(next.getTime() - amount * 7 * 24 * 60 * 60 * 1000);
      break;
    case "H":
      next.setTime(next.getTime() - amount * 60 * 60 * 1000);
      break;
    case "Mi":
      next.setTime(next.getTime() - amount * 60 * 1000);
      break;
    case "Mo":
      next.setUTCMonth(next.getUTCMonth() - amount);
      break;
    default: {
      const _exhaustive: never = unit;
      throw new Error(`Unsupported duration unit: ${_exhaustive}`);
    }
  }

  return next;
}

/** Rounded day count for UI copy (fund termDays, admin hints). Not used for payout scheduling. */
export function durationToApproxDays(spec: string): number {
  const { amount, unit } = parseDuration(spec);

  switch (unit) {
    case "D":
      return Math.round(amount);
    case "W":
      return Math.round(amount * 7);
    case "H":
      return Math.round(amount / 24);
    case "Mi":
      return Math.round(amount / (24 * 60));
    case "Mo":
      return Math.round(amount * 30);
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}
