import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WithdrawalOrderStatus,
  WithdrawalOrderStep,
} from "@prisma/client";
import { buildWithdrawalOrderSettlementView } from "./withdrawalOrderSettlementView";

describe("buildWithdrawalOrderSettlementView", () => {
  it("labels open order as Submitted", () => {
    const view = buildWithdrawalOrderSettlementView({
      status: WithdrawalOrderStatus.queued,
      step: WithdrawalOrderStep.awaiting_trx,
      failureReason: null,
    } as never);
    assert.equal(view.displayStatus, "pending");
    assert.equal(view.settlementLabel, "Submitted");
  });

  it("labels completed order as Completed", () => {
    const view = buildWithdrawalOrderSettlementView({
      status: WithdrawalOrderStatus.completed,
      step: WithdrawalOrderStep.done,
      failureReason: null,
    } as never);
    assert.equal(view.displayStatus, "confirmed");
    assert.equal(view.phase, "succeeded");
  });
});
