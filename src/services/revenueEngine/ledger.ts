import {
  Prisma,
  PurchaseOrderStatus,
  TreasuryEventType,
  type Investment,
  type TreasuryLedger,
} from "@prisma/client";
import { INVESTMENT_AMOUNT_USDT } from "@/lib/config/revenueEngine";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { getEnv } from "@/lib/env";
import { GLOBAL_LEDGER_ID, prisma } from "@/lib/prisma";
import { fieldIsNullOrUnset } from "@/lib/prisma/mongoFieldFilters";
import { surplusPerSubscription } from "./accounting";

export type LedgerSnapshot = {
  poolAvailable: number;
  treasurySurplus: number;
  protectedRevenueCredited: number;
  protectedRevenueWithdrawn: number;
  /** Gross liquidity inside pool not reserved for surplus (pool − surplus, 2dp truncate). */
  poolLiquidity: number;
  protectedRevenueAvailable: number;
  subscriberSlotsCredited: number;
  subscriberSlotsConsumed: number;
  subscriberSlotsAvailable: number;
  version: number;
  updatedAt: Date;
};

export async function getOrCreateLedger() {
  return prisma.treasuryLedger.upsert({
    where: { id: GLOBAL_LEDGER_ID },
    create: { id: GLOBAL_LEDGER_ID },
    update: {},
  });
}

function ledgerSnapshotFields(ledger: TreasuryLedger) {
  return {
    poolAvailable: ledgerTruncateUsdt(ledger.poolAvailable),
    treasurySurplus: ledgerTruncateUsdt(ledger.treasurySurplus),
    protectedRevenueCredited: ledgerTruncateUsdt(ledger.protectedRevenueCredited),
    protectedRevenueWithdrawn: ledgerTruncateUsdt(ledger.protectedRevenueWithdrawn),
  };
}

async function appendEvent(
  type: TreasuryEventType,
  amountUsdt: number,
  ledger: TreasuryLedger,
  extras: {
    investmentId?: string;
    purchaseOrderId?: string | null;
    withdrawalId?: string;
    meta?: Prisma.InputJsonValue;
  } = {}
) {
  const snap = ledgerSnapshotFields(ledger);
  await prisma.treasuryEvent.create({
    data: {
      type,
      amountUsdt: ledgerTruncateUsdt(amountUsdt),
      poolAfter: snap.poolAvailable,
      surplusAfter: snap.treasurySurplus,
      protectedCreditedAfter: snap.protectedRevenueCredited,
      protectedWithdrawnAfter: snap.protectedRevenueWithdrawn,
      investmentId: extras.investmentId,
      purchaseOrderId: extras.purchaseOrderId,
      withdrawalId: extras.withdrawalId,
      meta: extras.meta,
    },
  });
}

export async function recordSubscribeInflow(investment: Investment) {
  if (!investment.purchaseOrderId) {
    throw new Error(
      "Cannot record subscribe inflow: investment has no purchase order"
    );
  }

  const existingEvent = await prisma.treasuryEvent.findFirst({
    where: {
      type: TreasuryEventType.subscribe_inflow,
      OR: [
        { investmentId: investment.id },
        { purchaseOrderId: investment.purchaseOrderId },
      ],
    },
    select: { id: true },
  });
  if (existingEvent) {
    await prisma.purchaseOrder.updateMany({
      where: {
        AND: [
          { id: investment.purchaseOrderId },
          fieldIsNullOrUnset("subscribeInflowRecordedAt"),
        ],
      },
      data: { subscribeInflowRecordedAt: new Date() },
    });
    return getOrCreateLedger();
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: investment.purchaseOrderId },
    select: { status: true, usdtTxId: true },
  });

  if (!order?.usdtTxId?.trim()) {
    throw new Error(
      "Cannot record subscribe inflow: purchase order has no confirmed usdtTxId"
    );
  }

  if (order.status !== PurchaseOrderStatus.completed) {
    throw new Error(
      "Cannot record subscribe inflow: purchase order is not completed"
    );
  }

  const claim = await prisma.purchaseOrder.updateMany({
    where: {
      AND: [
        { id: investment.purchaseOrderId },
        { status: PurchaseOrderStatus.completed },
        fieldIsNullOrUnset("subscribeInflowRecordedAt"),
      ],
    },
    data: { subscribeInflowRecordedAt: new Date() },
  });
  if (claim.count !== 1) {
    return getOrCreateLedger();
  }

  const ledger = await getOrCreateLedger();
  const amount = ledgerTruncateUsdt(INVESTMENT_AMOUNT_USDT());
  const surplusSlice = surplusPerSubscription(investment.projectedPayoutUsdt);
  const updated = await prisma.treasuryLedger.update({
    where: { id: GLOBAL_LEDGER_ID },
    data: {
      poolAvailable: ledgerTruncateUsdt(ledger.poolAvailable + amount),
      treasurySurplus: ledgerTruncateUsdt(
        ledger.treasurySurplus + surplusSlice
      ),
      version: ledger.version + 1,
      updatedAt: new Date(),
    },
  });

  await appendEvent(
    TreasuryEventType.subscribe_inflow,
    amount,
    updated,
    {
      investmentId: investment.id,
      purchaseOrderId: investment.purchaseOrderId,
      meta: { fundId: investment.fundId },
    }
  );

  if (surplusSlice > 0) {
    await appendEvent(TreasuryEventType.surplus_credit, surplusSlice, updated, {
      investmentId: investment.id,
      purchaseOrderId: investment.purchaseOrderId,
      meta: {
        fundId: investment.fundId,
        reason: "subscribe_triad_slice",
        projectedPayoutUsdt: investment.projectedPayoutUsdt,
      },
    });
  }

  return updated;
}

export async function recordPayoutOutflow(
  investment: Investment,
  meta: Prisma.InputJsonValue = {}
) {
  const ledger = await getOrCreateLedger();
  const amount = ledgerTruncateUsdt(investment.projectedPayoutUsdt);
  const updated = await prisma.treasuryLedger.update({
    where: { id: GLOBAL_LEDGER_ID },
    data: {
      poolAvailable: ledgerTruncateUsdt(
        Math.max(0, ledger.poolAvailable - amount)
      ),
      version: ledger.version + 1,
      updatedAt: new Date(),
    },
  });

  await appendEvent(TreasuryEventType.payout_outflow, amount, updated, {
    investmentId: investment.id,
    meta,
  });

  return updated;
}

export async function creditSurplus(
  amountUsdt: number,
  investment: Investment,
  meta: Prisma.InputJsonValue = {}
) {
  if (amountUsdt <= 0) return getOrCreateLedger();

  const ledger = await getOrCreateLedger();
  const amount = ledgerTruncateUsdt(amountUsdt);
  const updated = await prisma.treasuryLedger.update({
    where: { id: GLOBAL_LEDGER_ID },
    data: {
      treasurySurplus: ledgerTruncateUsdt(ledger.treasurySurplus + amount),
      version: ledger.version + 1,
      updatedAt: new Date(),
    },
  });

  await appendEvent(TreasuryEventType.surplus_credit, amount, updated, {
    investmentId: investment.id,
    meta,
  });

  return updated;
}

export async function drawSurplus(
  amountUsdt: number,
  investment: Investment,
  meta: Prisma.InputJsonValue = {}
) {
  if (amountUsdt <= 0) return getOrCreateLedger();

  const ledger = await getOrCreateLedger();
  const amount = ledgerTruncateUsdt(amountUsdt);
  const availableSurplus = ledgerTruncateUsdt(ledger.treasurySurplus);
  if (availableSurplus < amount) {
    throw new Error(
      `Insufficient treasury surplus: need ${amount} USDT, available ${availableSurplus}`
    );
  }
  const updated = await prisma.treasuryLedger.update({
    where: { id: GLOBAL_LEDGER_ID },
    data: {
      treasurySurplus: ledgerTruncateUsdt(availableSurplus - amount),
      version: ledger.version + 1,
      updatedAt: new Date(),
    },
  });

  await appendEvent(TreasuryEventType.surplus_draw, amount, updated, {
    investmentId: investment.id,
    meta,
  });

  return updated;
}

/** Withdrawable liquidity = pool − surplus (simulation CSV semantics). */
export function computeWithdrawableFromLedgerFields(fields: {
  poolAvailable: number;
  treasurySurplus: number;
}): { poolLiquidity: number; protectedRevenueAvailable: number } {
  const poolLiquidity = ledgerTruncateUsdt(
    Math.max(
      0,
      ledgerTruncateUsdt(fields.poolAvailable) -
        ledgerTruncateUsdt(fields.treasurySurplus)
    )
  );
  return {
    poolLiquidity,
    protectedRevenueAvailable: poolLiquidity,
  };
}

function ledgerToSnapshot(ledger: TreasuryLedger): LedgerSnapshot {
  const snap = ledgerSnapshotFields(ledger);
  const { poolLiquidity, protectedRevenueAvailable } =
    computeWithdrawableFromLedgerFields(snap);
  return {
    poolAvailable: snap.poolAvailable,
    treasurySurplus: snap.treasurySurplus,
    protectedRevenueCredited: snap.protectedRevenueCredited,
    protectedRevenueWithdrawn: snap.protectedRevenueWithdrawn,
    poolLiquidity,
    protectedRevenueAvailable,
    subscriberSlotsCredited: ledger.subscriberSlotsCredited,
    subscriberSlotsConsumed: ledger.subscriberSlotsConsumed,
    subscriberSlotsAvailable: Math.max(
      0,
      ledger.subscriberSlotsCredited - ledger.subscriberSlotsConsumed
    ),
    version: ledger.version,
    updatedAt: ledger.updatedAt,
  };
}

/** Admin-facing snapshot: stored ledger only (updated by app events). */
export async function getAdminLedgerSnapshot(): Promise<LedgerSnapshot> {
  if (getEnv().treasuryLedgerDebug) {
    const { logLedgerIntegrityIfDebug } = await import("./ledgerReconcile");
    await logLedgerIntegrityIfDebug();
  }
  return getLedgerSnapshot();
}

export async function getLedgerSnapshot(): Promise<LedgerSnapshot> {
  const ledger = await getOrCreateLedger();
  return ledgerToSnapshot(ledger);
}

export async function recordReferralBonusOutflow(
  amountUsdt: number,
  meta: Prisma.InputJsonValue = {}
) {
  if (amountUsdt <= 0) return getOrCreateLedger();

  const ledger = await getOrCreateLedger();
  const amount = ledgerTruncateUsdt(amountUsdt);
  const availableSurplus = ledgerTruncateUsdt(ledger.treasurySurplus);
  if (availableSurplus < amount) {
    throw new Error(
      `Insufficient treasury surplus for referral bonus: need ${amount}, available ${availableSurplus}`
    );
  }

  const updated = await prisma.treasuryLedger.update({
    where: { id: GLOBAL_LEDGER_ID },
    data: {
      treasurySurplus: ledgerTruncateUsdt(availableSurplus - amount),
      version: ledger.version + 1,
      updatedAt: new Date(),
    },
  });

  await appendEvent(TreasuryEventType.referral_bonus_outflow, amount, updated, {
    meta,
  });

  return updated;
}

export async function recordReferralPrincipalRecovery(
  amountUsdt: number,
  investmentId: string,
  meta: Prisma.InputJsonValue = {}
) {
  const ledger = await getOrCreateLedger();
  const amount = ledgerTruncateUsdt(amountUsdt);
  const updated = await prisma.treasuryLedger.update({
    where: { id: GLOBAL_LEDGER_ID },
    data: {
      poolAvailable: ledgerTruncateUsdt(Math.max(0, ledger.poolAvailable - amount)),
      version: ledger.version + 1,
      updatedAt: new Date(),
    },
  });

  await appendEvent(TreasuryEventType.referral_principal_recovery, amount, updated, {
    investmentId,
    meta,
  });

  return updated;
}
