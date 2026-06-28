import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  ReferralPayoutOrderKind,
  ReferralPayoutOrderStatus,
} from "@prisma/client";
import { parseTransactionFailureReason } from "@/services/tron/client";

const SUBTRACTION_OVERFLOW_HEX =
  "536166654d6174683a207375627472616374696f6e206f766572666c6f77";

describe("parseTransactionFailureReason contractResult", () => {
  it("maps SafeMath subtraction overflow to treasury USDT message", () => {
    const result = parseTransactionFailureReason({
      id: "failed-referral-tx",
      receipt: { result: "REVERT", energy_fee: 82_000 },
      resMessage: "REVERT opcode executed",
      contractResult: SUBTRACTION_OVERFLOW_HEX,
    });
    assert.equal(result.retryable, false);
    assert.equal(
      result.message,
      "Treasury USDT balance too low for this transfer"
    );
  });
});
