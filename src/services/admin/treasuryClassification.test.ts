import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditCategoryToTreasuryChain,
  isAdminWithdrawalCategoryOverride,
} from "./treasuryClassification";

describe("treasuryClassification", () => {
  it("maps audit override to treasury chain categories", () => {
    assert.deepEqual(auditCategoryToTreasuryChain("treasury_app_withdrawal"), {
      category: "app_withdrawal",
      source: "app_tx",
    });
    assert.deepEqual(
      auditCategoryToTreasuryChain("treasury_outflow_untracked"),
      {
        category: "treasury_outflow_untracked",
        source: "external",
      }
    );
  });

  it("validates override enum", () => {
    assert.equal(isAdminWithdrawalCategoryOverride("treasury_app_withdrawal"), true);
    assert.equal(isAdminWithdrawalCategoryOverride("user_payout"), false);
  });
});
