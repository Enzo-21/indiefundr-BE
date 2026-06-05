/**
 * Dev-only structured logs for purchase-order settlement state transitions.
 * Grep server output with: settlement:trace
 */
export function settlementTraceLog(
  context: string,
  payload: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.log(
    "[settlement:trace]",
    JSON.stringify({
      context,
      at: new Date().toISOString(),
      ...payload,
    })
  );
}
