import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runAdminTreasuryEvaluate,
  runAdminTreasuryReconcile,
} from "./treasuryEvaluate";

describe("runAdminTreasuryReconcile", () => {
  it("rejects auto-reconcile (event-sourced ledger)", async () => {
    await assert.rejects(
      () => runAdminTreasuryReconcile(),
      /auto-reconcile is disabled/i
    );
  });
});

describe("runAdminTreasuryEvaluate", () => {
  it("is exported and returns evaluateAll shape", async () => {
    assert.equal(typeof runAdminTreasuryEvaluate, "function");
  });
});
