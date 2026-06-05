/**
 * Dev-only structured logs mirroring UI-visible wallet/auth state.
 * Grep server output with: ui:snapshot
 */
export function uiSnapshotLog(
  event: string,
  payload: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.log(
    "[ui:snapshot]",
    JSON.stringify({
      event,
      at: new Date().toISOString(),
      ...payload,
    })
  );
}

export function slimWalletActivityTx(tx: {
  id: string;
  type: string;
  source: string;
  amount: number;
  status: string;
  label: string;
  date: string | Date;
  txId?: string | null;
}) {
  return {
    id: tx.id,
    type: tx.type,
    source: tx.source,
    amount: tx.amount,
    status: tx.status,
    label: tx.label,
    date: tx.date instanceof Date ? tx.date.toISOString() : tx.date,
    txId: tx.txId ?? null,
  };
}
