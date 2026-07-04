/**
 * Audit forfeited investments vs treasury ledger drift.
 *
 * Usage:
 *   DATABASE_URL='mongodb://.../staging' npm run audit:forfeiture-ledger
 */
import "dotenv/config";
import {
  InvestmentStatus,
  PurchaseOrderStatus,
  TreasuryEventType,
} from "@prisma/client";
import { surplusPerSubscription } from "../src/lib/config/investmentCohort";
import { ledgerTruncateUsdt } from "../src/lib/money/formatUsdt";
import { prisma } from "../src/lib/prisma";
import {
  buildLedgerIntegrityReport,
  fieldsMismatch,
  LEDGER_RECONCILE_EPSILON,
} from "../src/services/revenueEngine/ledgerReconcile";

const TERMINAL_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.referral_recovered,
  InvestmentStatus.failed,
  InvestmentStatus.forfeited,
];

async function main() {
  const report = await buildLedgerIntegrityReport();

  const forfeitedRows = await prisma.investment.findMany({
    where: {
      status: InvestmentStatus.forfeited,
      subscribedAt: { not: null },
      purchaseOrder: {
        status: PurchaseOrderStatus.completed,
        usdtTxId: { not: null },
      },
    },
    select: {
      id: true,
      amountUsdt: true,
      projectedPayoutUsdt: true,
      forfeitureReason: true,
      forfeitedAt: true,
    },
    orderBy: [{ forfeitedAt: "asc" }, { id: "asc" }],
  });

  const forfeitedByReason = new Map<string, { count: number; principal: number }>();
  for (const row of forfeitedRows) {
    const reason = row.forfeitureReason ?? "unknown";
    const entry = forfeitedByReason.get(reason) ?? { count: 0, principal: 0 };
    entry.count += 1;
    entry.principal += row.amountUsdt;
    forfeitedByReason.set(reason, entry);
  }

  const obligationEvents = await prisma.treasuryEvent.findMany({
    where: { type: TreasuryEventType.obligation_forfeiture },
    select: { investmentId: true },
  });
  const obligationInvestmentIds = new Set(
    obligationEvents
      .map((e) => e.investmentId)
      .filter((id): id is string => id != null)
  );
  const forfeitedWithoutObligationEvent = forfeitedRows
    .filter((row) => !obligationInvestmentIds.has(row.id))
    .map((row) => row.id);

  const terminalWithSubscribeInflow = await prisma.investment.findMany({
    where: {
      status: { in: TERMINAL_STATUSES },
      subscribedAt: { not: null },
      purchaseOrder: {
        status: PurchaseOrderStatus.completed,
        usdtTxId: { not: null },
      },
    },
    select: {
      id: true,
      status: true,
      amountUsdt: true,
      projectedPayoutUsdt: true,
    },
  });

  const terminalSummary = TERMINAL_STATUSES.map((status) => {
    const rows = terminalWithSubscribeInflow.filter((r) => r.status === status);
    const principal = ledgerTruncateUsdt(
      rows.reduce((sum, r) => sum + r.amountUsdt, 0)
    );
    const surplusSlice = ledgerTruncateUsdt(
      rows.reduce(
        (sum, r) =>
          sum + surplusPerSubscription(r.projectedPayoutUsdt, r.amountUsdt),
        0
      )
    );
    return { status, count: rows.length, principal, surplusSlice };
  });

  const eventReplayDelta = {
    poolAvailable: ledgerTruncateUsdt(
      report.stored.poolAvailable - report.expected.poolAvailable
    ),
    treasurySurplus: ledgerTruncateUsdt(
      report.stored.treasurySurplus - report.expected.treasurySurplus
    ),
    protectedRevenueWithdrawn: ledgerTruncateUsdt(
      report.stored.protectedRevenueWithdrawn -
        report.expected.protectedRevenueWithdrawn
    ),
  };

  const cohortDelta = {
    poolAvailable: ledgerTruncateUsdt(
      report.stored.poolAvailable - report.cohortExpected.poolAvailable
    ),
    treasurySurplus: ledgerTruncateUsdt(
      report.stored.treasurySurplus - report.cohortExpected.treasurySurplus
    ),
    protectedRevenueWithdrawn: ledgerTruncateUsdt(
      report.stored.protectedRevenueWithdrawn -
        report.cohortExpected.protectedRevenueWithdrawn
    ),
  };

  const realDrift = fieldsMismatch(report.stored, report.expected);
  const cohortOnlyDrift =
    !realDrift && fieldsMismatch(report.stored, report.cohortExpected);

  const output = {
    summary: {
      realEventReplayDrift: realDrift,
      cohortFormulaDrift: report.cohortMismatch,
      cohortOnlyDriftExplainedByForfeitures: cohortOnlyDrift,
      forfeitedCount: report.forfeitureImpact.count,
      forfeitedPrincipalInPool: report.forfeitureImpact.principalTotal,
      forfeitedSurplusSliceInPool: report.forfeitureImpact.surplusSliceTotal,
    },
    stored: report.stored,
    expectedEventReplay: report.expected,
    expectedCohort: report.cohortExpected,
    eventReplayDelta,
    cohortDelta,
    forfeitureImpact: report.forfeitureImpact,
    forfeitedByReason: Object.fromEntries(forfeitedByReason),
    forfeitedWithoutObligationEvent,
    terminalStatusSummary: terminalSummary,
    integrityMeta: {
      confirmedSubscriptionCount: report.confirmedSubscriptionCount,
      treasuryEventCount: report.treasuryEventCount,
      epsilon: LEDGER_RECONCILE_EPSILON,
    },
  };

  console.log("=== Forfeiture ledger audit ===\n");
  console.log(JSON.stringify(output, null, 2));

  console.log("\n--- Human summary ---");
  console.log(
    `Stored pool: ${report.stored.poolAvailable} | Event replay expected: ${report.expected.poolAvailable} | Cohort expected: ${report.cohortExpected.poolAvailable}`
  );
  console.log(
    `Stored surplus: ${report.stored.treasurySurplus} | Event replay: ${report.expected.treasurySurplus} | Cohort: ${report.cohortExpected.treasurySurplus}`
  );
  if (report.forfeitureImpact.count > 0) {
    console.log(
      `Forfeited: ${report.forfeitureImpact.count} investment(s); $${report.forfeitureImpact.principalTotal} principal retained in pool by design`
    );
    if (report.cohortMismatch && !realDrift) {
      console.log(
        "Cohort formula under-counts pool vs stored — expected when forfeitures exist (informational only)"
      );
    }
  }
  if (forfeitedWithoutObligationEvent.length > 0) {
    console.log(
      `WARNING: ${forfeitedWithoutObligationEvent.length} forfeited investment(s) missing obligation_forfeiture event`
    );
  }
  if (realDrift) {
    console.log(
      "REAL DRIFT: stored ledger does not match event replay — investigate treasury events"
    );
  } else {
    console.log("OK: stored ledger matches event replay");
  }

  if (realDrift) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
