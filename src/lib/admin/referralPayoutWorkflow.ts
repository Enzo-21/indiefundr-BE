export function resolveBroadcastTxId(
  broadcastStep: { txId?: string | null; manualSkip?: boolean } | undefined,
  seedUsdtTxId?: string | null,
  txIdOverride?: string | null
): string | null {
  const override = txIdOverride?.trim();
  if (override) {
    return override;
  }
  if (broadcastStep?.txId) {
    return broadcastStep.txId;
  }
  if (broadcastStep?.manualSkip && seedUsdtTxId) {
    return seedUsdtTxId;
  }
  return null;
}
