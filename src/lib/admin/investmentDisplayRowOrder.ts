import type { AdminInvestmentDisplayRow } from "@/services/admin/investmentAdminTypes";

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

export function formatUnlockHint(
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

export function enrichLedgerDisplayFlags(rows: AdminInvestmentDisplayRow[]): void {
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

export function refreshPayoutSortAtIso(
  rows: AdminInvestmentDisplayRow[]
): AdminInvestmentDisplayRow[] {
  const subscribedAtByInvestmentId = new Map<string, string>();
  for (const row of rows) {
    if (row.displayKind === "subscription" && row.subscribedAtIso) {
      subscribedAtByInvestmentId.set(row.investmentId, row.subscribedAtIso);
    }
  }

  return rows.map((row) => {
    if (row.displayKind !== "payout" || row.eventKind !== "payout") {
      return row;
    }
    const source = row.parentInvestment;
    if (!source) {
      return row;
    }

    const unlockerTimes = source.payoutUnlockingInvestmentIds
      .map((id) => subscribedAtByInvestmentId.get(id))
      .filter((iso): iso is string => iso != null)
      .map((iso) => new Date(iso).getTime());

    if (unlockerTimes.length === 0) {
      return row;
    }

    const sortAtIso = new Date(Math.max(...unlockerTimes)).toISOString();
    return {
      ...row,
      sortAtIso,
      subscribedAtIso: sortAtIso,
    };
  });
}

/** Re-sort merged display rows chronologically and rebuild step numbers and unlock hints. */
export function reorderInvestmentDisplayRows(
  rows: AdminInvestmentDisplayRow[]
): AdminInvestmentDisplayRow[] {
  const refreshed = refreshPayoutSortAtIso(rows);
  const sorted = [...refreshed].sort(compareDisplayRows);

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
