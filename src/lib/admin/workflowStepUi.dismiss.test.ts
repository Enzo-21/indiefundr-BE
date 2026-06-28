import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAdminWorkflowDismissBlocked } from "./workflowStepUi";

describe("isAdminWorkflowDismissBlocked", () => {
  it("blocks while workflow is running", () => {
    assert.equal(isAdminWorkflowDismissBlocked({ running: true }), true);
  });

  it("blocks while waiting for on-chain confirmation", () => {
    assert.equal(
      isAdminWorkflowDismissBlocked({
        steps: [{ state: "waiting_chain" }],
      }),
      true
    );
  });

  it("blocks during retry countdown", () => {
    assert.equal(
      isAdminWorkflowDismissBlocked({
        retryCountdownUntil: new Date(Date.now() + 60_000),
      }),
      true
    );
  });

  it("allows dismiss when idle", () => {
    assert.equal(
      isAdminWorkflowDismissBlocked({
        running: false,
        steps: [{ state: "idle" }, { state: "success" }],
      }),
      false
    );
  });
});
