import type {
  AdminInvestmentDisplayRow,
  AdminInvestmentRow,
  InvestmentDisplayKind,
} from "@/services/admin/investmentAdminTypes";
import {
  type InvestmentLedgerEventKind,
  type InvestmentLedgerSnapshot,
  type InvestmentLedgerView,
} from "@/services/admin/investmentLedgerSnapshots";
import { ledgerTruncateUsdt } from "@/lib/money/formatUsdt";
import { surplusPerSubscription } from "@/services/revenueEngine/accounting";
import { isSurplusPayoutTrigger } from "@/services/revenueEngine/payoutScheduler";

export type {
  AdminInvestmentDisplayRow,
  InvestmentDisplayKind,
} from "@/services/admin/investmentAdminTypes";

type TimelineEntry = {
  rowKey: string;
  investmentId: string;
  displayKind: InvestmentDisplayKind;
  sortAt: Date;
  eventKind: InvestmentLedgerEventKind;
  ledger: InvestmentLedgerSnapshot | null;
  amountUsdt: number;
  subscribedAtIso: string | null;
  subscribedColumnHint: string | null;
  investment: AdminInvestmentRow | null;
  parentInvestment: AdminInvestmentRow | null;
};

function shouldEmitTriadPayoutRow(row: AdminInvestmentRow): boolean {
  if (row.payoutUnlockedAt != null) {
    return true;
  }
  return (
    row.ledgerAfterPayout != null &&
    !isSurplusPayoutTrigger(row.payoutTriggeredBy)
  );
}

/** Surplus payout row: eligible (pending), redeeming (pending ledger), or completed. */
function shouldEmitSurplusTimelineRow(row: AdminInvestmentRow): boolean {
  if (row.payoutUnlockedAt != null) {
    return false;
  }
  if (
    row.ledgerAfterPayout != null &&
    isSurplusPayoutTrigger(row.payoutTriggeredBy)
  ) {
    return true;
  }
  if (
    row.status === "redeeming" &&
    isSurplusPayoutTrigger(row.payoutTriggeredBy)
  ) {
    return true;
  }
  return row.canPayWithSurplus;
}

export function computePayoutSortAt(
  row: AdminInvestmentRow,
  ledgerView: InvestmentLedgerView | undefined,
  subscribedAtByInvestmentId: Map<string, Date>
): Date {
  const unlockerDates = row.payoutUnlockingInvestmentIds
    .map((id) => subscribedAtByInvestmentId.get(id))
    .filter((date): date is Date => date != null);

  if (unlockerDates.length > 0) {
    return new Date(Math.max(...unlockerDates.map((d) => d.getTime())));
  }

  return (
    row.payoutUnlockedAt ??
    row.redeemedAt ??
    ledgerView?.payoutEventCreatedAt ??
    new Date(0)
  );
}

export function computeSurplusPayoutSortAt(
  row: AdminInvestmentRow,
  ledgerView: InvestmentLedgerView | undefined
): Date {
  if (row.ledgerAfterPayout) {
    return (
      row.redeemedAt ??
      ledgerView?.payoutEventCreatedAt ??
      row.surplusPayoutAvailableAt ??
      row.maturesAt ??
      row.subscribedAt ??
      new Date(0)
    );
  }

  return (
    row.surplusPayoutAvailableAt ??
    row.maturesAt ??
    row.subscribedAt ??
    new Date(0)
  );
}

function compareTimelineEntries(a: TimelineEntry, b: TimelineEntry): number {
  const timeDiff = a.sortAt.getTime() - b.sortAt.getTime();
  if (timeDiff !== 0) return timeDiff;
  if (a.displayKind !== b.displayKind) {
    return a.displayKind === "subscription" ? -1 : 1;
  }
  return a.investmentId.localeCompare(b.investmentId);
}

function compareDisplayRows(
  a: AdminInvestmentDisplayRow,
  b: AdminInvestmentDisplayRow
): number {
  const timeDiff =
    new Date(a.sortAtIso).getTime() - new Date(b.sortAtIso).getTime();
  if (timeDiff !== 0) return timeDiff;
  if (a.displayKind !== b.displayKind) {
    return a.displayKind === "subscription" ? -1 : 1;
  }
  return a.investmentId.localeCompare(b.investmentId);
}

/** Re-sort merged display rows chronologically and rebuild step numbers and unlock hints. */
export function reorderInvestmentDisplayRows(
  rows: AdminInvestmentDisplayRow[]
): AdminInvestmentDisplayRow[] {
  const sorted = [...rows].sort(compareDisplayRows);

  const subscriptionStepByInvestmentId = new Map<string, number>();
  const withSteps = sorted.map((row, index) => {
    const chronologicalStep = index + 1;
    if (row.displayKind === "subscription") {
      subscriptionStepByInvestmentId.set(row.investmentId, chronologicalStep);
    }
    return { ...row, chronologicalStep };
  });

  const withHints = withSteps.map((row) => {
    if (row.displayKind !== "payout" || row.eventKind !== "payout") {
      return row;
    }
    const source = row.parentInvestment;
    if (!source) return row;
    const hint = formatUnlockHint(
      source.id,
      source.payoutUnlockingInvestmentIds,
      subscriptionStepByInvestmentId
    );
    return hint != null ? { ...row, subscribedColumnHint: hint } : row;
  });

  enrichLedgerDisplayFlags(withHints);
  return withHints;
}

function formatUnlockHint(
  targetInvestmentId: string,
  unlockerIds: string[],
  subscriptionStepByInvestmentId: Map<string, number>
): string | null {
  const targetStep = subscriptionStepByInvestmentId.get(targetInvestmentId);
  const targetPrefix = targetStep != null ? `#${targetStep} ` : "";

  if (unlockerIds.length === 0) {
    return targetStep != null
      ? `${targetPrefix}unlocked (payable)`
      : "Unlocked (payable)";
  }
  const unlockerSteps = unlockerIds
    .map((id) => subscriptionStepByInvestmentId.get(id))
    .filter((step): step is number => step != null);
  if (unlockerSteps.length === 0) {
    return targetStep != null
      ? `${targetPrefix}unlocked (payable)`
      : "Unlocked (payable)";
  }
  const unlockerLabel = unlockerSteps.map((s) => `#${s}`).join(", ");
  return `${targetPrefix}unlocked after ${unlockerLabel}`;
}

function enrichLedgerSurplusDeltas(
  rows: AdminInvestmentDisplayRow[],
  ledgerViews: Map<string, InvestmentLedgerView>
): void {
  for (const row of rows) {
    if (!row.ledger) {
      row.ledgerSurplusDelta = null;
      continue;
    }

    const ledgerView = ledgerViews.get(row.investmentId);
    const source = row.investment ?? row.parentInvestment;

    if (row.displayKind === "subscription") {
      const credit =
        ledgerView?.subscribeSurplusCredit ??
        (source != null
          ? surplusPerSubscription(source.projectedPayoutUsdt, source.amountUsdt)
          : null);
      row.ledgerSurplusDelta = credit;
      continue;
    }

    if (row.displayKind === "payout") {
      const draw = ledgerView?.payoutSurplusDraw ?? 0;
      if (draw > 0) {
        row.ledgerSurplusDelta = ledgerTruncateUsdt(-draw);
        continue;
      }
      if (row.eventKind === "surplus_payout" && source != null) {
        row.ledgerSurplusDelta = ledgerTruncateUsdt(
          -source.projectedPayoutUsdt
        );
        continue;
      }
      row.ledgerSurplusDelta = 0;
    }
  }
}

function enrichLedgerDisplayFlags(rows: AdminInvestmentDisplayRow[]): void {
  let pendingPayoutCount = 0;
  for (const row of rows) {
    const isUnpaidPayout =
      row.displayKind === "payout" && row.ledger == null;
    const isCompletedPayout =
      row.displayKind === "payout" && row.ledger != null;

    row.ledgerPending = isUnpaidPayout;
    row.ledgerContingent = pendingPayoutCount > 0 && row.ledger != null;

    if (isUnpaidPayout) {
      pendingPayoutCount += 1;
    }
    if (isCompletedPayout) {
      pendingPayoutCount = Math.max(0, pendingPayoutCount - 1);
    }
  }
}

function pushPayoutEntry(
  entries: TimelineEntry[],
  row: AdminInvestmentRow,
  options: {
    eventKind: InvestmentLedgerEventKind;
    sortAt: Date;
    ledger: InvestmentLedgerSnapshot | null;
  }
) {
  entries.push({
    rowKey: `${row.id}:payout`,
    investmentId: row.id,
    displayKind: "payout",
    sortAt: options.sortAt,
    eventKind: options.eventKind,
    ledger: options.ledger,
    amountUsdt: row.projectedPayoutUsdt,
    subscribedAtIso: options.sortAt.toISOString(),
    subscribedColumnHint: null,
    investment: null,
    parentInvestment: row,
  });
}

export function buildInvestmentLedgerTimeline(
  rows: AdminInvestmentRow[],
  ledgerViews: Map<string, InvestmentLedgerView> = new Map()
): AdminInvestmentDisplayRow[] {
  const subscribedAtByInvestmentId = new Map<string, Date>();
  for (const row of rows) {
    if (row.subscribedAt) {
      subscribedAtByInvestmentId.set(row.id, row.subscribedAt);
    }
  }

  const entries: TimelineEntry[] = [];

  for (const row of rows) {
    const sortAt = row.subscribedAt ?? new Date(0);
    entries.push({
      rowKey: `${row.id}:subscription`,
      investmentId: row.id,
      displayKind: "subscription",
      sortAt,
      eventKind: "subscription",
      ledger: row.ledgerAfterSubscribe,
      amountUsdt: row.amountUsdt,
      subscribedAtIso: row.subscribedAtIso,
      subscribedColumnHint: null,
      investment: row,
      parentInvestment: null,
    });

    const ledgerView = ledgerViews.get(row.id);
    const payoutLedger = row.ledgerAfterPayout ?? null;

    if (shouldEmitTriadPayoutRow(row)) {
      pushPayoutEntry(entries, row, {
        eventKind: "payout",
        sortAt: computePayoutSortAt(
          row,
          ledgerView,
          subscribedAtByInvestmentId
        ),
        ledger: payoutLedger,
      });
    } else if (shouldEmitSurplusTimelineRow(row)) {
      pushPayoutEntry(entries, row, {
        eventKind: "surplus_payout",
        sortAt: computeSurplusPayoutSortAt(row, ledgerView),
        ledger: payoutLedger,
      });
    }
  }

  entries.sort(compareTimelineEntries);

  const subscriptionStepByInvestmentId = new Map<string, number>();
  const displayRows: AdminInvestmentDisplayRow[] = entries.map(
    (entry, index) => {
      const chronologicalStep = index + 1;
      if (entry.displayKind === "subscription") {
        subscriptionStepByInvestmentId.set(entry.investmentId, chronologicalStep);
      }
      return {
        rowKey: entry.rowKey,
        investmentId: entry.investmentId,
        displayKind: entry.displayKind,
        chronologicalStep,
        sortAtIso: entry.sortAt.toISOString(),
        eventKind: entry.eventKind,
        ledger: entry.ledger,
        ledgerSurplusDelta: null,
        ledgerPending: false,
        ledgerContingent: false,
        amountUsdt: entry.amountUsdt,
        subscribedAtIso: entry.subscribedAtIso,
        subscribedColumnHint: entry.subscribedColumnHint,
        userEmail: entry.investment?.userEmail ?? "",
        userName: entry.investment?.userName ?? null,
        fundName: entry.investment?.fundName ?? "",
        returnPercent90d: entry.investment?.returnPercent90d ?? 0,
        investment: entry.investment,
        parentInvestment: entry.parentInvestment,
      };
    }
  );

  for (const displayRow of displayRows) {
    if (displayRow.displayKind !== "payout") continue;
    const source = displayRow.parentInvestment;
    if (!source) continue;
    displayRow.userEmail = source.userEmail;
    displayRow.userName = source.userName;
    displayRow.fundName = source.fundName;
    displayRow.returnPercent90d = source.returnPercent90d;
    if (displayRow.eventKind === "payout") {
      displayRow.subscribedColumnHint = formatUnlockHint(
        source.id,
        source.payoutUnlockingInvestmentIds,
        subscriptionStepByInvestmentId
      );
    }
  }

  enrichLedgerSurplusDeltas(displayRows, ledgerViews);
  enrichLedgerDisplayFlags(displayRows);

  return displayRows;
}
