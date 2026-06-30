import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePrincipalRecoveryInvestmentId,
  principalRecoveryActivityEntityId,
} from "@/services/referrals/referralWalletActivity";
import { principalRecoveryInsightsKey } from "./hydratePrincipalRecoveryInsights";

describe("principal recovery entity id", () => {
  it("round-trips investment id through entity id helpers", () => {
    const investmentId = "6a42c892a418f041eacb130e";
    const entityId = principalRecoveryActivityEntityId(investmentId);
    assert.equal(
      parsePrincipalRecoveryInvestmentId(entityId),
      investmentId
    );
    assert.equal(
      principalRecoveryInsightsKey("referral_principal_recovery", entityId),
      `referral_principal_recovery:${entityId}`
    );
  });

  it("returns null for unrelated entity ids", () => {
    assert.equal(parsePrincipalRecoveryInvestmentId("referral-pending:user1"), null);
  });
});
