import type { AdminHistoryRow } from "@/services/admin/history";

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function formatPayoutUnlockers(row: AdminHistoryRow): string {
  return row.payoutUnlockers
    .map((unlocker) => unlocker.email || unlocker.name || unlocker.userId)
    .join("; ");
}

export function historyRowsToCsv(rows: AdminHistoryRow[]): string {
  const headers = [
    "date",
    "source",
    "type",
    "label",
    "status",
    "direction",
    "amountUsdt",
    "userEmail",
    "fromUserEmail",
    "toUserEmail",
    "fromAddress",
    "toAddress",
    "detail",
    "payoutUnlockers",
    "txId",
    "tronscanUrl",
    "poolAfter",
    "surplusAfter",
    "protectedCreditedAfter",
    "protectedWithdrawnAfter",
  ];

  const lines = rows.map((row) =>
    [
      row.date,
      row.source,
      row.type,
      row.label,
      row.status,
      row.direction,
      row.amountUsdt,
      row.userEmail,
      row.fromUserEmail,
      row.toUserEmail,
      row.fromAddress,
      row.toAddress,
      row.detail,
      formatPayoutUnlockers(row),
      row.txId,
      row.tronscanUrl,
      row.poolAfter,
      row.surplusAfter,
      row.protectedCreditedAfter,
      row.protectedWithdrawnAfter,
    ]
      .map(csvCell)
      .join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}
