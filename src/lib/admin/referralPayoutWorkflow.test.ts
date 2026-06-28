import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBroadcastTxId } from "./referralPayoutWorkflow";

describe("resolveBroadcastTxId", () => {
  it("prefers txIdOverride over stale step ref", () => {
    const txId = resolveBroadcastTxId(
      { txId: null, state: "running" } as { txId: string | null },
      null,
      "4289e5d7ccd4251e3590f4268598cc1d78915dc1bb0f1273926bbdf18152ee85"
    );
    assert.equal(
      txId,
      "4289e5d7ccd4251e3590f4268598cc1d78915dc1bb0f1273926bbdf18152ee85"
    );
  });

  it("falls back to broadcast step txId when no override", () => {
    assert.equal(
      resolveBroadcastTxId({ txId: "abc-tx" }, null, null),
      "abc-tx"
    );
  });

  it("uses seed txId when broadcast step was manually skipped", () => {
    assert.equal(
      resolveBroadcastTxId({ manualSkip: true }, "seed-tx", null),
      "seed-tx"
    );
  });

  it("returns null when no tx id is available", () => {
    assert.equal(resolveBroadcastTxId({ txId: null }, null, null), null);
  });
});
