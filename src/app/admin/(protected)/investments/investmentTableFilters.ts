import type { AdminInvestmentsListResult } from "@/services/admin/investmentAdminTypes";
import { reorderInvestmentDisplayRows } from "@/lib/admin/investmentDisplayRowOrder";

export type InvestmentTableFilters = {
  showQueue: boolean;
  showArchive: boolean;
};

export type InvestmentFetchMode = "none" | "queue" | "archive" | "both";

export type InvestmentTableStreamCursors = {
  queueCursor: string | null;
  archiveCursor: string | null;
  queueHasMore: boolean;
  archiveHasMore: boolean;
};

export const INVESTMENT_TABLE_NONE_SELECTED_MESSAGE =
  "Select Action queue and/or Paid / archive to show investments.";

export function resolveFetchMode(
  filters: InvestmentTableFilters
): InvestmentFetchMode {
  if (filters.showQueue && filters.showArchive) {
    return "both";
  }
  if (filters.showQueue) {
    return "queue";
  }
  if (filters.showArchive) {
    return "archive";
  }
  return "none";
}

export function appendInvestmentListSnapshot(
  current: AdminInvestmentsListResult,
  next: AdminInvestmentsListResult
): AdminInvestmentsListResult {
  return {
    ...next,
    rows: [...current.rows, ...next.rows],
    displayRows: [...current.displayRows, ...next.displayRows],
  };
}

export function mergeInvestmentListSnapshots(
  queue: AdminInvestmentsListResult | null,
  archive: AdminInvestmentsListResult | null,
  limit: number
): AdminInvestmentsListResult {
  const base = queue ?? archive;
  if (!base) {
    throw new Error("At least one investment list snapshot is required to merge");
  }

  const displayRows = reorderInvestmentDisplayRows([
    ...(queue?.displayRows ?? []),
    ...(archive?.displayRows ?? []),
  ]);

  return {
    rows: [...(queue?.rows ?? []), ...(archive?.rows ?? [])],
    displayRows,
    currentLedger: queue?.currentLedger ?? archive!.currentLedger,
    payoutAvailability:
      queue?.payoutAvailability ?? archive!.payoutAvailability,
    pageInfo: {
      hasMore:
        (queue?.pageInfo.hasMore ?? false) ||
        (archive?.pageInfo.hasMore ?? false),
      nextCursor: null,
      view: "all",
      limit,
    },
  };
}

export function buildEmptyInvestmentListSnapshot(
  fallback: AdminInvestmentsListResult,
  limit: number
): AdminInvestmentsListResult {
  return {
    rows: [],
    displayRows: [],
    currentLedger: fallback.currentLedger,
    payoutAvailability: fallback.payoutAvailability,
    pageInfo: {
      hasMore: false,
      nextCursor: null,
      view: "all",
      limit,
    },
  };
}

export function extractStreamCursors(
  queue: AdminInvestmentsListResult | null,
  archive: AdminInvestmentsListResult | null
): InvestmentTableStreamCursors {
  return {
    queueCursor: queue?.pageInfo.nextCursor ?? null,
    archiveCursor: archive?.pageInfo.nextCursor ?? null,
    queueHasMore: queue?.pageInfo.hasMore ?? false,
    archiveHasMore: archive?.pageInfo.hasMore ?? false,
  };
}

export function getInvestmentTableEmptyMessage(
  mode: InvestmentFetchMode
): string {
  if (mode === "none") {
    return INVESTMENT_TABLE_NONE_SELECTED_MESSAGE;
  }
  if (mode === "archive") {
    return "No paid or archived investments on this page.";
  }
  if (mode === "both") {
    return "No investments match these filters on this page.";
  }
  return "No open investments on this page.";
}

export type InvestmentStreamSnapshots = {
  queue: AdminInvestmentsListResult | null;
  archive: AdminInvestmentsListResult | null;
};

type FetchInvestmentsResult = Awaited<
  ReturnType<
    typeof import("@/actions/admin/dashboard").fetchAdminInvestments
  >
>;

type FetchInvestments = (
  options: import("@/services/admin/adminInvestmentListQuery").ListAdminInvestmentsOptions
) => Promise<FetchInvestmentsResult>;

export async function fetchInvestmentsForFilters(
  fetchInvestments: FetchInvestments,
  filters: InvestmentTableFilters,
  options: {
    limit: number;
    fundId?: string;
    queueCursor?: string;
    archiveCursor?: string;
    queueSnapshot?: AdminInvestmentsListResult | null;
    archiveSnapshot?: AdminInvestmentsListResult | null;
    append?: boolean;
  }
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      mode: InvestmentFetchMode;
      data: AdminInvestmentsListResult;
      streams: InvestmentStreamSnapshots;
      cursors: InvestmentTableStreamCursors;
    }
> {
  const mode = resolveFetchMode(filters);
  const fundId = options.fundId || undefined;

  if (mode === "none") {
    return {
      ok: true,
      mode,
      data: buildEmptyInvestmentListSnapshot(
        options.queueSnapshot ??
          options.archiveSnapshot ?? {
            rows: [],
            displayRows: [],
            currentLedger: {
              poolAvailable: 0,
              treasurySurplus: 0,
              poolLiquidity: 0,
              protectedRevenueAvailable: 0,
            },
            payoutAvailability: {
              unlockedPayoutCount: 0,
              surplusPayoutCount: 0,
            },
            pageInfo: {
              hasMore: false,
              nextCursor: null,
              view: "all",
              limit: options.limit,
            },
          },
        options.limit
      ),
      streams: { queue: null, archive: null },
      cursors: {
        queueCursor: null,
        archiveCursor: null,
        queueHasMore: false,
        archiveHasMore: false,
      },
    };
  }

  if (mode === "queue") {
    const result = await fetchInvestments({
      view: "queue",
      limit: options.limit,
      fundId,
      cursor: options.queueCursor,
    });
    if (!result.ok) {
      return { ok: false, error: result.error.msg };
    }
    const queue = options.append && options.queueSnapshot
      ? appendInvestmentListSnapshot(options.queueSnapshot, result.data)
      : result.data;
    return {
      ok: true,
      mode,
      data: queue,
      streams: { queue, archive: null },
      cursors: extractStreamCursors(queue, null),
    };
  }

  if (mode === "archive") {
    const result = await fetchInvestments({
      view: "archive",
      limit: options.limit,
      fundId,
      cursor: options.archiveCursor,
    });
    if (!result.ok) {
      return { ok: false, error: result.error.msg };
    }
    const archive = options.append && options.archiveSnapshot
      ? appendInvestmentListSnapshot(options.archiveSnapshot, result.data)
      : result.data;
    return {
      ok: true,
      mode,
      data: archive,
      streams: { queue: null, archive },
      cursors: extractStreamCursors(null, archive),
    };
  }

  const result = await fetchInvestments({
    view: "all",
    limit: options.limit,
    fundId,
    cursor: options.queueCursor,
  });
  if (!result.ok) {
    return { ok: false, error: result.error.msg };
  }
  const combined = options.append && options.queueSnapshot
    ? appendInvestmentListSnapshot(options.queueSnapshot, result.data)
    : result.data;
  return {
    ok: true,
    mode,
    data: combined,
    streams: { queue: null, archive: null },
    cursors: {
      queueCursor: combined.pageInfo.nextCursor,
      archiveCursor: null,
      queueHasMore: combined.pageInfo.hasMore,
      archiveHasMore: false,
    },
  };
}
