import { InvestmentStatus } from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import { prisma } from "@/lib/prisma";

export const TYPICAL_PAYOUT_MIN_SAMPLES = 100;

export function defaultTypicalPayoutDays(termDays: number): number {
  return Math.round(termDays * 0.5 * 1.1);
}

export function payoutDaysBetweenFloor(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export type TypicalPayoutSample = {
  subscribedAt: Date | null;
  date: Date;
  redeemedAt: Date;
};

function subscribeDate(
  sample: Pick<TypicalPayoutSample, "subscribedAt" | "date">
): Date {
  return sample.subscribedAt ?? sample.date;
}

export function typicalPayoutDaysFromSamples(
  samples: TypicalPayoutSample[],
  termDays: number
): number {
  if (samples.length < TYPICAL_PAYOUT_MIN_SAMPLES) {
    return defaultTypicalPayoutDays(termDays);
  }
  const total = samples.reduce((sum, sample) => {
    const start = subscribeDate(sample);
    return sum + payoutDaysBetweenFloor(start, sample.redeemedAt);
  }, 0);
  return Math.round(total / samples.length);
}

const redeemedWhere = (fundId: string) => ({
  fundId,
  status: InvestmentStatus.redeemed,
  redeemedAt: { not: null },
});

export async function getTypicalPayoutDaysForFund(
  fundId: string,
  termDays: number
): Promise<number> {
  const count = await prisma.investment.count({
    where: redeemedWhere(fundId),
  });
  if (count < TYPICAL_PAYOUT_MIN_SAMPLES) {
    return defaultTypicalPayoutDays(termDays);
  }
  const rows = await prisma.investment.findMany({
    where: redeemedWhere(fundId),
    select: { subscribedAt: true, date: true, redeemedAt: true },
  });
  const samples: TypicalPayoutSample[] = [];
  for (const row of rows) {
    if (row.redeemedAt == null) continue;
    samples.push({
      subscribedAt: row.subscribedAt,
      date: row.date,
      redeemedAt: row.redeemedAt,
    });
  }
  return typicalPayoutDaysFromSamples(samples, termDays);
}

export async function loadTypicalPayoutDaysByFundIds(
  fundIds: string[]
): Promise<Map<string, number>> {
  const unique = [...new Set(fundIds.filter(Boolean))];
  const map = new Map<string, number>();
  await Promise.all(
    unique.map(async (fundId) => {
      const fund = getFundById(fundId);
      const termDays = fund?.termDays ?? 90;
      map.set(fundId, await getTypicalPayoutDaysForFund(fundId, termDays));
    })
  );
  return map;
}

export function resolveTypicalPayoutDays(
  fundId: string,
  termDays: number,
  typicalByFund?: Map<string, number>
): number {
  const fromMap = typicalByFund?.get(fundId);
  if (fromMap != null && fromMap >= 1) {
    return fromMap;
  }
  return defaultTypicalPayoutDays(termDays);
}
