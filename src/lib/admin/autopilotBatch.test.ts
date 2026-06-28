import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceAutopilotBatchQueue,
  appendAutopilotNote,
  buildAutopilotCompleteToastMessage,
  buildAutopilotStopToastMessage,
  formatInvestmentAutopilotManualCheckReason,
  formatOrderAutopilotManualCheckNote,
  isAutopilotWorkflowInterruptedFailure,
} from "./autopilotBatch";

describe("autopilotBatch helpers", () => {
  it("advanceAutopilotBatchQueue returns next candidate when more remain", () => {
    const queue = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = advanceAutopilotBatchQueue(queue, 0, 1, []);
    assert.equal(result.done, false);
    if (!result.done) {
      assert.deepEqual(result.nextCandidate, { id: "b" });
      assert.equal(result.completedCount, 1);
    }
  });

  it("advanceAutopilotBatchQueue marks batch done on last item", () => {
    const queue = [{ id: "a" }, { id: "b" }];
    const manualCheck = [
      {
        key: "a",
        label: "user@example.com",
        detail: "Growth",
        error: "failed",
      },
    ];
    const result = advanceAutopilotBatchQueue(queue, 1, 1, manualCheck);
    assert.equal(result.done, true);
    if (result.done) {
      assert.deepEqual(result.manualCheckItems, manualCheck);
    }
  });

  it("formats order autopilot manual check note with date", () => {
    const note = formatOrderAutopilotManualCheckNote(
      "Insufficient USDT",
      new Date("2026-06-03T12:00:00.000Z")
    );
    assert.equal(
      note,
      "[Autopilot 2026-06-03] Manual check needed — Insufficient USDT"
    );
  });

  it("formats investment autopilot manual check reason", () => {
    assert.equal(
      formatInvestmentAutopilotManualCheckReason("Broadcast failed"),
      "Autopilot: manual check needed — Broadcast failed"
    );
  });

  it("appendAutopilotNote preserves existing notes", () => {
    assert.equal(
      appendAutopilotNote("Existing note", "[Autopilot] Manual check needed — x"),
      "Existing note\n[Autopilot] Manual check needed — x"
    );
    assert.equal(
      appendAutopilotNote(null, "[Autopilot] Manual check needed — x"),
      "[Autopilot] Manual check needed — x"
    );
  });

  it("buildAutopilotCompleteToastMessage covers mixed outcomes", () => {
    assert.equal(
      buildAutopilotCompleteToastMessage({
        itemLabel: "order",
        completedCount: 8,
        manualCheckCount: 2,
      }),
      "Autopilot finished — 8 orders completed, 2 require manual check"
    );
    assert.equal(
      buildAutopilotStopToastMessage({
        itemLabel: "payout",
        completedCount: 3,
        manualCheckCount: 1,
      }),
      "Autopilot stopped — 3 payouts completed, 1 requires manual check"
    );
  });

  it("isAutopilotWorkflowInterruptedFailure detects cancelled and in-flight steps", () => {
    assert.equal(
      isAutopilotWorkflowInterruptedFailure(
        { success: false, error: "Cancelled" },
        [{ state: "waiting_chain" }]
      ),
      true
    );
    assert.equal(
      isAutopilotWorkflowInterruptedFailure(
        { success: false, error: "Timed out waiting for on-chain confirmation" },
        [{ state: "waiting_chain" }]
      ),
      false
    );
    assert.equal(
      isAutopilotWorkflowInterruptedFailure(
        { success: false, error: "Broadcast failed", interrupted: false },
        [{ state: "failed" }]
      ),
      false
    );
    assert.equal(
      isAutopilotWorkflowInterruptedFailure(
        { success: false, error: "Unknown", interrupted: true },
        [{ state: "success" }]
      ),
      true
    );
    assert.equal(
      isAutopilotWorkflowInterruptedFailure(
        { success: false, error: "Order automation failed" },
        [{ state: "retry_wait" }]
      ),
      true
    );
  });

  it("isAutopilotWorkflowInterruptedFailure is false when broadcast step failed", () => {
    assert.equal(
      isAutopilotWorkflowInterruptedFailure(
        {
          success: false,
          error: "Not enough test USDT on Shasta",
          interrupted: false,
        },
        [{ state: "failed" }, { state: "idle" }, { state: "idle" }]
      ),
      false
    );
    assert.equal(
      isAutopilotWorkflowInterruptedFailure(
        { success: false, error: "Treasury USDT balance too low" },
        [
          { state: "failed" },
          { state: "idle" },
          { state: "idle" },
        ]
      ),
      false
    );
  });
});
