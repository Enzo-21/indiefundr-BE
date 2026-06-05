import { TreasuryEventType } from "@prisma/client";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { GLOBAL_LEDGER_ID, prisma } from "@/lib/prisma";
import { getOrCreateLedger } from "./ledger";

export type ExternalInflowTreatment = "none" | "withdrawable" | "surplus";

export const AUDIT_EXTERNAL_DEPOSIT_SYNC_WHERE = {
  category: "treasury_external_deposit",
  status: "confirmed",
  direction: "in",
} as const;

const EXTERNAL_DEPOSIT_META_REASON = "external_treasury_deposit";
const EXTERNAL_SURPLUS_META_REASON = "external_treasury_surplus";
const EXTERNAL_CLEAR_META_REASON = "external_treasury_clear";

type AuditInflowRow = {
  id: string;
  txId: string;
  amountUsdt: number;
  category: string;
  status: string;
  direction: string;
  poolInflowRecordedAt: Date | null;
  adminSurplusMarkedAt: Date | null;
};

function deriveTreatment(row: {
  poolInflowRecordedAt: Date | null;
  adminSurplusMarkedAt: Date | null;
}): ExternalInflowTreatment {
  if (row.adminSurplusMarkedAt) return "surplus";
  if (row.poolInflowRecordedAt) return "withdrawable";
  return "none";
}

async function loadAuditInflowRow(txId: string): Promise<AuditInflowRow | null> {
  return prisma.adminOnChainTransaction.findFirst({
    where: { txId, direction: "in" },
    select: {
      id: true,
      txId: true,
      amountUsdt: true,
      category: true,
      status: true,
      direction: true,
      poolInflowRecordedAt: true,
      adminSurplusMarkedAt: true,
    },
  });
}

async function assertEligibleExternalTreasuryInflow(txId: string): Promise<{
  amountUsdt: number;
  auditId: string;
  audit: AuditInflowRow;
}> {
  const audit = await loadAuditInflowRow(txId);
  if (!audit) {
    throw new Error(
      "Treasury inflow not found in audit history; sync treasury history first"
    );
  }
  if (audit.category !== "treasury_external_deposit") {
    throw new Error(
      "Only external treasury deposits can be classified as withdrawable or surplus"
    );
  }
  if (audit.status !== "confirmed") {
    throw new Error("Only confirmed treasury inflows can be recorded on the ledger");
  }
  if (audit.direction !== "in") {
    throw new Error("Only inbound treasury transfers can be classified");
  }

  const amount = ledgerTruncateUsdt(audit.amountUsdt);
  if (amount <= 0) {
    throw new Error("Inflow amount must be positive");
  }

  const orderMatch = await prisma.purchaseOrder.findFirst({
    where: { usdtTxId: txId },
    select: { id: true },
  });

  if (orderMatch) {
    throw new Error(
      "This transaction is linked to an investment payment and cannot be treated as an external treasury deposit"
    );
  }

  return { amountUsdt: amount, auditId: audit.id, audit };
}

async function creditPoolInflow({
  txId,
  amount,
  adminEmail,
  note,
}: {
  txId: string;
  amount: number;
  adminEmail: string;
  note?: string;
}) {
  const ledger = await getOrCreateLedger();
  return prisma.$transaction(async (tx) => {
    const nextLedger = await tx.treasuryLedger.update({
      where: { id: GLOBAL_LEDGER_ID },
      data: {
        poolAvailable: ledgerTruncateUsdt(ledger.poolAvailable + amount),
        version: ledger.version + 1,
        updatedAt: new Date(),
      },
    });

    await tx.treasuryEvent.create({
      data: {
        type: TreasuryEventType.external_deposit_inflow,
        amountUsdt: amount,
        poolAfter: ledgerTruncateUsdt(nextLedger.poolAvailable),
        surplusAfter: ledgerTruncateUsdt(nextLedger.treasurySurplus),
        protectedCreditedAfter: ledgerTruncateUsdt(
          nextLedger.protectedRevenueCredited
        ),
        protectedWithdrawnAfter: ledgerTruncateUsdt(
          nextLedger.protectedRevenueWithdrawn
        ),
        meta: {
          txRef: txId,
          reason: EXTERNAL_DEPOSIT_META_REASON,
          note: note?.trim() || null,
          createdBy: adminEmail,
        },
      },
    });

    await tx.adminOnChainTransaction.updateMany({
      where: { txId },
      data: { poolInflowRecordedAt: new Date() },
    });

    return nextLedger;
  });
}

async function creditSurplusSlice({
  txId,
  amount,
  adminEmail,
  note,
}: {
  txId: string;
  amount: number;
  adminEmail: string;
  note?: string;
}) {
  const ledger = await getOrCreateLedger();
  return prisma.$transaction(async (tx) => {
    const nextLedger = await tx.treasuryLedger.update({
      where: { id: GLOBAL_LEDGER_ID },
      data: {
        treasurySurplus: ledgerTruncateUsdt(ledger.treasurySurplus + amount),
        version: ledger.version + 1,
        updatedAt: new Date(),
      },
    });

    await tx.treasuryEvent.create({
      data: {
        type: TreasuryEventType.surplus_credit,
        amountUsdt: amount,
        poolAfter: ledgerTruncateUsdt(nextLedger.poolAvailable),
        surplusAfter: ledgerTruncateUsdt(nextLedger.treasurySurplus),
        protectedCreditedAfter: ledgerTruncateUsdt(
          nextLedger.protectedRevenueCredited
        ),
        protectedWithdrawnAfter: ledgerTruncateUsdt(
          nextLedger.protectedRevenueWithdrawn
        ),
        meta: {
          txRef: txId,
          reason: EXTERNAL_SURPLUS_META_REASON,
          note: note?.trim() || null,
          markedBy: adminEmail,
        },
      },
    });

    await tx.adminOnChainTransaction.updateMany({
      where: { txId },
      data: {
        adminSurplusMarkedAt: new Date(),
        adminSurplusMarkedBy: adminEmail,
      },
    });

    return nextLedger;
  });
}

export async function markExternalTreasuryInflowAsWithdrawable({
  txId,
  adminEmail,
  note,
}: {
  txId: string;
  adminEmail: string;
  note?: string;
}) {
  const normalizedTxId = txId.trim();
  if (!normalizedTxId) {
    throw new Error("txId is required");
  }

  const audit = await loadAuditInflowRow(normalizedTxId);
  const treatment = audit ? deriveTreatment(audit) : "none";
  if (treatment === "withdrawable") {
    return { ledger: await getOrCreateLedger(), alreadyMarked: true as const };
  }
  if (treatment === "surplus") {
    throw new Error(
      "This deposit is marked as surplus; use Mark as withdrawable to move it to withdrawable liquidity"
    );
  }

  const resolved = await assertEligibleExternalTreasuryInflow(normalizedTxId);
  const updatedLedger = await creditPoolInflow({
    txId: normalizedTxId,
    amount: resolved.amountUsdt,
    adminEmail,
    note: note?.trim() || "Marked as withdrawable liquidity",
  });

  return { ledger: updatedLedger, alreadyMarked: false as const };
}

export async function markExternalTreasuryInflowAsSurplus({
  txId,
  adminEmail,
  note,
}: {
  txId: string;
  adminEmail: string;
  note?: string;
}) {
  const normalizedTxId = txId.trim();
  if (!normalizedTxId) {
    throw new Error("txId is required");
  }

  const audit = await loadAuditInflowRow(normalizedTxId);
  const treatment = audit ? deriveTreatment(audit) : "none";
  if (treatment === "surplus") {
    return { ledger: await getOrCreateLedger(), alreadyMarked: true as const };
  }

  const resolved = await assertEligibleExternalTreasuryInflow(normalizedTxId);
  const amount = resolved.amountUsdt;

  if (treatment === "none") {
    await creditPoolInflow({
      txId: normalizedTxId,
      amount,
      adminEmail,
      note: note?.trim() || "Pool inflow before surplus mark",
    });
  }

  const updatedLedger = await creditSurplusSlice({
    txId: normalizedTxId,
    amount,
    adminEmail,
    note: note?.trim() || "Marked as surplus",
  });

  return { ledger: updatedLedger, alreadyMarked: false as const };
}

export async function markExternalTreasuryInflowAsWithdrawableFromSurplus({
  txId,
  adminEmail,
  note,
}: {
  txId: string;
  adminEmail: string;
  note?: string;
}) {
  const normalizedTxId = txId.trim();
  if (!normalizedTxId) {
    throw new Error("txId is required");
  }

  const audit = await loadAuditInflowRow(normalizedTxId);
  if (!audit?.adminSurplusMarkedAt) {
    throw new Error("This treasury inflow is not marked as surplus");
  }
  if (!audit.poolInflowRecordedAt) {
    throw new Error("Pool inflow must be recorded before changing surplus mark");
  }

  const amount = ledgerTruncateUsdt(audit.amountUsdt);
  const ledger = await getOrCreateLedger();
  const availableSurplus = ledgerTruncateUsdt(ledger.treasurySurplus);
  if (availableSurplus < amount) {
    throw new Error(
      `Insufficient treasury surplus: need ${amount} USDT, available ${availableSurplus}`
    );
  }

  const updatedLedger = await prisma.$transaction(async (tx) => {
    const nextLedger = await tx.treasuryLedger.update({
      where: { id: GLOBAL_LEDGER_ID },
      data: {
        treasurySurplus: ledgerTruncateUsdt(availableSurplus - amount),
        version: ledger.version + 1,
        updatedAt: new Date(),
      },
    });

    await tx.treasuryEvent.create({
      data: {
        type: TreasuryEventType.surplus_draw,
        amountUsdt: amount,
        poolAfter: ledgerTruncateUsdt(nextLedger.poolAvailable),
        surplusAfter: ledgerTruncateUsdt(nextLedger.treasurySurplus),
        protectedCreditedAfter: ledgerTruncateUsdt(
          nextLedger.protectedRevenueCredited
        ),
        protectedWithdrawnAfter: ledgerTruncateUsdt(
          nextLedger.protectedRevenueWithdrawn
        ),
        meta: {
          txRef: normalizedTxId,
          reason: EXTERNAL_SURPLUS_META_REASON,
          note: note?.trim() || "Moved external deposit to withdrawable liquidity",
          revertedBy: adminEmail,
        },
      },
    });

    await tx.adminOnChainTransaction.updateMany({
      where: { txId: normalizedTxId },
      data: {
        adminSurplusMarkedAt: null,
        adminSurplusMarkedBy: null,
      },
    });

    return nextLedger;
  });

  return { ledger: updatedLedger };
}

export async function clearExternalTreasuryInflowClassification({
  txId,
  adminEmail,
  note,
}: {
  txId: string;
  adminEmail: string;
  note?: string;
}) {
  const normalizedTxId = txId.trim();
  if (!normalizedTxId) {
    throw new Error("txId is required");
  }

  const audit = await loadAuditInflowRow(normalizedTxId);
  if (!audit?.poolInflowRecordedAt && !audit?.adminSurplusMarkedAt) {
    return { ledger: await getOrCreateLedger(), alreadyCleared: true as const };
  }

  await assertEligibleExternalTreasuryInflow(normalizedTxId);

  const amount = ledgerTruncateUsdt(audit.amountUsdt);
  const ledger = await getOrCreateLedger();
  const treatment = deriveTreatment(audit);

  if (treatment === "surplus") {
    const availableSurplus = ledgerTruncateUsdt(ledger.treasurySurplus);
    if (availableSurplus < amount) {
      throw new Error(
        `Insufficient treasury surplus: need ${amount} USDT, available ${availableSurplus}`
      );
    }
  }

  const poolAvailable = ledgerTruncateUsdt(ledger.poolAvailable);
  if (poolAvailable < amount) {
    throw new Error(
      `Insufficient pool available: need ${amount} USDT, available ${poolAvailable}`
    );
  }

  const updatedLedger = await prisma.$transaction(async (tx) => {
    let nextPool = poolAvailable;
    let nextSurplus = ledgerTruncateUsdt(ledger.treasurySurplus);

    if (treatment === "surplus") {
      nextSurplus = ledgerTruncateUsdt(nextSurplus - amount);
      await tx.treasuryEvent.create({
        data: {
          type: TreasuryEventType.surplus_draw,
          amountUsdt: amount,
          poolAfter: nextPool,
          surplusAfter: nextSurplus,
          protectedCreditedAfter: ledgerTruncateUsdt(
            ledger.protectedRevenueCredited
          ),
          protectedWithdrawnAfter: ledgerTruncateUsdt(
            ledger.protectedRevenueWithdrawn
          ),
          meta: {
            txRef: normalizedTxId,
            reason: EXTERNAL_CLEAR_META_REASON,
            note: note?.trim() || "Cleared external surplus classification",
            clearedBy: adminEmail,
          },
        },
      });
    }

    nextPool = ledgerTruncateUsdt(nextPool - amount);
    const nextLedger = await tx.treasuryLedger.update({
      where: { id: GLOBAL_LEDGER_ID },
      data: {
        poolAvailable: nextPool,
        treasurySurplus: nextSurplus,
        version: ledger.version + 1,
        updatedAt: new Date(),
      },
    });

    await tx.treasuryEvent.create({
      data: {
        type: TreasuryEventType.ledger_adjustment,
        amountUsdt: amount,
        poolAfter: nextPool,
        surplusAfter: nextSurplus,
        protectedCreditedAfter: ledgerTruncateUsdt(
          nextLedger.protectedRevenueCredited
        ),
        protectedWithdrawnAfter: ledgerTruncateUsdt(
          nextLedger.protectedRevenueWithdrawn
        ),
        meta: {
          txRef: normalizedTxId,
          reason: EXTERNAL_CLEAR_META_REASON,
          field: "poolAvailable",
          note: note?.trim() || "Cleared external deposit classification",
          clearedBy: adminEmail,
        },
      },
    });

    await tx.adminOnChainTransaction.updateMany({
      where: { txId: normalizedTxId },
      data: {
        poolInflowRecordedAt: null,
        adminSurplusMarkedAt: null,
        adminSurplusMarkedBy: null,
      },
    });

    return nextLedger;
  });

  return { ledger: updatedLedger, alreadyCleared: false as const };
}

export type ExternalInflowState = {
  treatment: ExternalInflowTreatment;
};

export function treatmentFromAuditRow(row: {
  poolInflowRecordedAt: Date | null;
  adminSurplusMarkedAt: Date | null;
}): ExternalInflowTreatment {
  return deriveTreatment(row);
}

export async function loadInflowTreatmentByTxId(): Promise<
  Map<string, ExternalInflowState>
> {
  const rows = await prisma.adminOnChainTransaction.findMany({
    where: {
      txId: { not: "" },
      OR: [
        { poolInflowRecordedAt: { not: null } },
        { adminSurplusMarkedAt: { not: null } },
      ],
    },
    select: {
      txId: true,
      poolInflowRecordedAt: true,
      adminSurplusMarkedAt: true,
    },
  });

  const map = new Map<string, ExternalInflowState>();
  for (const row of rows) {
    map.set(row.txId, { treatment: deriveTreatment(row) });
  }
  return map;
}

/** @deprecated Use loadInflowTreatmentByTxId */
export async function loadInflowSurplusStateByTxId(): Promise<
  Map<string, { poolRecorded: boolean; surplusMarked: boolean }>
> {
  const map = await loadInflowTreatmentByTxId();
  const legacy = new Map<string, { poolRecorded: boolean; surplusMarked: boolean }>();
  for (const [txId, state] of map) {
    legacy.set(txId, {
      poolRecorded: state.treatment !== "none",
      surplusMarked: state.treatment === "surplus",
    });
  }
  return legacy;
}
