import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enrichTrc20TransferStatuses,
  isRetryableFeeBroadcastError,
  mapInspectionToActivityStatus,
  parseTransactionFailureReason,
  subtractPendingInboundUsdt,
  sumPendingInboundUsdt,
} from "./client";

describe("tron client failure helpers", () => {
  it("isRetryableFeeBroadcastError detects fee-related messages", () => {
    assert.equal(isRetryableFeeBroadcastError("OUT_OF_ENERGY"), true);
    assert.equal(
      isRetryableFeeBroadcastError("account bandwidth is not enough"),
      true
    );
    assert.equal(isRetryableFeeBroadcastError("invalid address"), false);
  });

  it("parseTransactionFailureReason marks OUT_OF_ENERGY as retryable", () => {
    const result = parseTransactionFailureReason({
      id: "abc",
      receipt: { result: "OUT_OF_ENERGY" },
      fee: 1_000_000,
    });
    assert.equal(result.retryable, true);
    assert.equal(result.code, "OUT_OF_ENERGY");
    assert.equal(result.feeTrx, 1);
    assert.match(result.message, /network fees/i);
  });

  it("parseTransactionFailureReason returns PENDING when tx missing", () => {
    const result = parseTransactionFailureReason(null);
    assert.equal(result.retryable, false);
    assert.equal(result.code, "PENDING");
  });
});

describe("subtractPendingInboundUsdt", () => {
  it("subtracts pending inbound from on-chain balance", () => {
    assert.equal(subtractPendingInboundUsdt(150, 50), 100);
  });

  it("never returns negative balance", () => {
    assert.equal(subtractPendingInboundUsdt(30, 50), 0);
  });
});

describe("TRC20 history status fallback", () => {
  it("maps lookup failures to the requested fallback status", () => {
    assert.equal(
      mapInspectionToActivityStatus(
        { status: "pending", lookupFailed: true },
        "confirmed"
      ),
      "confirmed"
    );
    assert.equal(
      mapInspectionToActivityStatus(
        { status: "pending", lookupFailed: false },
        "confirmed"
      ),
      "pending"
    );
  });

  it("keeps history rows confirmed when status lookup is rate-limited", async () => {
    const rows = await enrichTrc20TransferStatuses(
      [
        {
          txId: "tx-history-in",
          type: "in",
          amount: 35,
          date: new Date("2026-05-25T17:53:15.000Z"),
          from: "TTREASURY",
          to: "TUSER",
        },
      ],
      {
        fallbackStatusOnLookupError: "confirmed",
        inspectTransaction: async () => {
          throw new Error("Request failed with status code 429");
        },
      }
    );

    assert.equal(rows[0].status, "confirmed");
    assert.equal(sumPendingInboundUsdt(rows), 0);
    assert.equal(subtractPendingInboundUsdt(10, sumPendingInboundUsdt(rows)), 10);
  });

  it("defaults to pending without a history fallback", async () => {
    const rows = await enrichTrc20TransferStatuses(
      [
        {
          txId: "tx-app-controlled",
          type: "in",
          amount: 35,
          date: new Date("2026-05-25T17:53:15.000Z"),
          from: "TTREASURY",
          to: "TUSER",
        },
      ],
      {
        inspectTransaction: async () => {
          throw new Error("Request failed with status code 429");
        },
      }
    );

    assert.equal(rows[0].status, "pending");
    assert.equal(sumPendingInboundUsdt(rows), 35);
  });
});
