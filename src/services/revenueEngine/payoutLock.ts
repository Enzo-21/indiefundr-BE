import { InvestmentStatus } from "@prisma/client";
import { GLOBAL_LEDGER_ID, prisma } from "@/lib/prisma";
import { fieldIsNullOrUnset } from "@/lib/prisma/mongoFieldFilters";
import * as tron from "@/services/tron/client";
import { getOrCreateLedger } from "./ledger";
import type { PayoutTrigger } from "./payoutScheduler";

const PAYOUT_LOCK_TTL_MS = 30 * 60 * 1000;

export class PayoutInProgressError extends Error {
  activeInvestmentId?: string | null;

  constructor(activeInvestmentId?: string | null) {
    super("Another payout is currently processing. Try again after it confirms or fails.");
    this.name = "PayoutInProgressError";
    this.activeInvestmentId = activeInvestmentId;
  }
}

function lockExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + PAYOUT_LOCK_TTL_MS);
}

async function hasPendingRedemptionTransaction(
  investmentId: string
): Promise<boolean> {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: { status: true, redemptionTransaction: true },
  });
  if (!investment || investment.status !== InvestmentStatus.redeeming) {
    return false;
  }

  const txId = tron.getTxId(
    investment.redemptionTransaction as Record<string, unknown> | null
  );
  return Boolean(txId);
}

async function clearRecoverableExpiredLock(now: Date) {
  const ledger = await getOrCreateLedger();
  const activeInvestmentId = ledger.activePayoutInvestmentId;
  if (
    !activeInvestmentId ||
    !ledger.activePayoutLockExpiresAt ||
    ledger.activePayoutLockExpiresAt > now
  ) {
    return;
  }

  if (await hasPendingRedemptionTransaction(activeInvestmentId)) {
    return;
  }

  await prisma.treasuryLedger.updateMany({
    where: {
      id: GLOBAL_LEDGER_ID,
      activePayoutInvestmentId: activeInvestmentId,
      activePayoutLockExpiresAt: { lte: now },
    },
    data: {
      activePayoutInvestmentId: null,
      activePayoutStartedAt: null,
      activePayoutTrigger: null,
      activePayoutLockExpiresAt: null,
      updatedAt: now,
    },
  });
}

export async function acquirePayoutLock(
  investmentId: string,
  trigger: PayoutTrigger,
  now = new Date()
) {
  await clearRecoverableExpiredLock(now);

  let acquired;
  try {
    acquired = await prisma.treasuryLedger.updateMany({
      where: {
        AND: [
          { id: GLOBAL_LEDGER_ID },
          fieldIsNullOrUnset("activePayoutInvestmentId"),
        ],
      },
      data: {
        activePayoutInvestmentId: investmentId,
        activePayoutStartedAt: now,
        activePayoutTrigger: trigger,
        activePayoutLockExpiresAt: lockExpiresAt(now),
        updatedAt: now,
      },
    });
  } catch (error) {
    throw error;
  }

  if (acquired.count !== 1) {
    const ledger = await getOrCreateLedger();
    throw new PayoutInProgressError(ledger.activePayoutInvestmentId);
  }
}

export async function releasePayoutLock(investmentId: string) {
  await prisma.treasuryLedger.updateMany({
    where: {
      id: GLOBAL_LEDGER_ID,
      activePayoutInvestmentId: investmentId,
    },
    data: {
      activePayoutInvestmentId: null,
      activePayoutStartedAt: null,
      activePayoutTrigger: null,
      activePayoutLockExpiresAt: null,
      updatedAt: new Date(),
    },
  });
}

export async function withGlobalPayoutLock<T>(
  investmentId: string,
  trigger: PayoutTrigger,
  fn: () => Promise<T>,
  {
    releaseOnSuccess = false,
    keepLockOnSuccess,
  }: {
    releaseOnSuccess?: boolean;
    keepLockOnSuccess?: (result: T) => boolean;
  } = {}
): Promise<T> {
  await acquirePayoutLock(investmentId, trigger);

  try {
    const result = await fn();
    const shouldRelease =
      releaseOnSuccess ||
      (keepLockOnSuccess != null && !keepLockOnSuccess(result));
    if (shouldRelease) {
      await releasePayoutLock(investmentId);
    }
    return result;
  } catch (error) {
    await releasePayoutLock(investmentId);
    throw error;
  }
}
