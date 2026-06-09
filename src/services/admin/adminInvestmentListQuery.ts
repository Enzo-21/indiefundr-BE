import { InvestmentStatus, type Prisma } from "@prisma/client";

export type AdminInvestmentsView = "queue" | "archive" | "all";

export type ListAdminInvestmentsOptions = {
  limit?: number;
  cursor?: string;
  view?: AdminInvestmentsView;
  status?: InvestmentStatus[];
  fundId?: string;
  hidePaid?: boolean;
};

export type AdminInvestmentsPageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
  view: AdminInvestmentsView;
  limit: number;
};

export const ADMIN_INVESTMENTS_DEFAULT_LIMIT = 100;
export const ADMIN_INVESTMENTS_MAX_LIMIT = 200;

const QUEUE_EXCLUDED_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.redeemed,
  InvestmentStatus.referral_recovered,
  InvestmentStatus.failed,
];

const ARCHIVE_STATUSES: InvestmentStatus[] = [
  InvestmentStatus.redeemed,
  InvestmentStatus.referral_recovered,
  InvestmentStatus.failed,
];

type QueueCursor = {
  kind: "queue";
  subscribedAt: string;
  id: string;
};

type ArchiveCursor = {
  kind: "archive";
  redeemedAt: string | null;
  subscribedAt: string;
  id: string;
};

type ListCursor = QueueCursor | ArchiveCursor;

export function clampAdminInvestmentsLimit(limit?: number): number {
  const value = limit ?? ADMIN_INVESTMENTS_DEFAULT_LIMIT;
  return Math.min(ADMIN_INVESTMENTS_MAX_LIMIT, Math.max(1, value));
}

export function resolveAdminInvestmentsView(
  options: ListAdminInvestmentsOptions
): AdminInvestmentsView {
  if (options.view) {
    return options.view;
  }
  if (options.hidePaid === false) {
    return "all";
  }
  return "queue";
}

function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAdminInvestmentsCursor(
  cursor: string | undefined
): ListCursor | null {
  if (!cursor) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as ListCursor;
    if (parsed.kind === "queue") {
      if (!parsed.subscribedAt || !parsed.id) {
        return null;
      }
      return parsed;
    }
    if (parsed.kind === "archive") {
      if (!parsed.id) {
        return null;
      }
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function queueCursorFromRow(row: {
  subscribedAt: Date | null;
  id: string;
}): string | null {
  if (!row.subscribedAt) {
    return null;
  }
  return encodeCursor({
    kind: "queue",
    subscribedAt: row.subscribedAt.toISOString(),
    id: row.id,
  });
}

function archiveCursorFromRow(row: {
  redeemedAt: Date | null;
  subscribedAt: Date | null;
  id: string;
}): string {
  return encodeCursor({
    kind: "archive",
    redeemedAt: row.redeemedAt?.toISOString() ?? null,
    subscribedAt: row.subscribedAt?.toISOString() ?? row.id,
    id: row.id,
  });
}

export function buildAdminInvestmentsPageInfo({
  view,
  limit,
  rows,
}: {
  view: AdminInvestmentsView;
  limit: number;
  rows: Array<{
    id: string;
    subscribedAt: Date | null;
    redeemedAt: Date | null;
  }>;
}): AdminInvestmentsPageInfo {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];

  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor =
      view === "archive"
        ? archiveCursorFromRow(last)
        : queueCursorFromRow(last);
  }

  return {
    hasMore,
    nextCursor,
    view,
    limit,
  };
}

export function sliceAdminInvestmentsPage<T>(rows: T[], limit: number): T[] {
  return rows.length > limit ? rows.slice(0, limit) : rows;
}

function baseViewWhere(
  view: AdminInvestmentsView,
  status?: InvestmentStatus[]
): Prisma.InvestmentWhereInput {
  if (status && status.length > 0) {
    return { status: { in: status } };
  }

  switch (view) {
    case "archive":
      return { status: { in: ARCHIVE_STATUSES } };
    case "all":
      return {};
    case "queue":
    default:
      return { status: { notIn: QUEUE_EXCLUDED_STATUSES } };
  }
}

function queueCursorWhere(cursor: QueueCursor): Prisma.InvestmentWhereInput {
  const subscribedAt = new Date(cursor.subscribedAt);
  return {
    OR: [
      { subscribedAt: { gt: subscribedAt } },
      {
        subscribedAt,
        id: { gt: cursor.id },
      },
    ],
  };
}

function archiveCursorWhere(cursor: ArchiveCursor): Prisma.InvestmentWhereInput {
  const redeemedAt = cursor.redeemedAt ? new Date(cursor.redeemedAt) : null;
  const subscribedAt = new Date(cursor.subscribedAt);

  if (redeemedAt) {
    return {
      OR: [
        { redeemedAt: { lt: redeemedAt } },
        {
          redeemedAt,
          id: { lt: cursor.id },
        },
        {
          redeemedAt: null,
        },
      ],
    };
  }

  return {
    OR: [
      {
        redeemedAt: null,
        subscribedAt: { lt: subscribedAt },
      },
      {
        redeemedAt: null,
        subscribedAt,
        id: { lt: cursor.id },
      },
    ],
  };
}

export function buildAdminInvestmentsWhere(
  options: ListAdminInvestmentsOptions
): {
  view: AdminInvestmentsView;
  limit: number;
  where: Prisma.InvestmentWhereInput;
  orderBy: Prisma.InvestmentOrderByWithRelationInput[];
} {
  const view = resolveAdminInvestmentsView(options);
  const limit = clampAdminInvestmentsLimit(options.limit);
  const decodedCursor = decodeAdminInvestmentsCursor(options.cursor);

  const filters: Prisma.InvestmentWhereInput[] = [baseViewWhere(view, options.status)];
  if (options.fundId) {
    filters.push({ fundId: options.fundId });
  }
  if (decodedCursor) {
    if (view === "archive" && decodedCursor.kind === "archive") {
      filters.push(archiveCursorWhere(decodedCursor));
    } else if (view !== "archive" && decodedCursor.kind === "queue") {
      filters.push(queueCursorWhere(decodedCursor));
    }
  }

  const orderBy: Prisma.InvestmentOrderByWithRelationInput[] =
    view === "archive"
      ? [{ redeemedAt: "desc" }, { subscribedAt: "desc" }, { id: "desc" }]
      : [{ subscribedAt: "asc" }, { id: "asc" }];

  return {
    view,
    limit,
    where: { AND: filters },
    orderBy,
  };
}
