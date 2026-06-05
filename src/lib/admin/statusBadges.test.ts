import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  badgeVariantForClassificationSource,
  badgeVariantForHistorySource,
  badgeVariantForHistoryStatus,
  badgeVariantForInvestmentStatus,
  badgeVariantForLedgerEventKind,
  badgeVariantForPayoutStatus,
  badgeVariantForSurplusPayoutStatus,
  badgeVariantForTreasuryCategory,
  badgeVariantForWithdrawalSync,
} from "./statusBadges";

describe("statusBadges", () => {
  it("maps history sources to distinct variants", () => {
    assert.equal(badgeVariantForHistorySource("ledger"), "info");
    assert.equal(badgeVariantForHistorySource("treasury_chain"), "payout");
    assert.equal(badgeVariantForHistorySource("wallet_chain"), "neutral");
  });

  it("maps history statuses", () => {
    assert.equal(badgeVariantForHistoryStatus("confirmed"), "success");
    assert.equal(badgeVariantForHistoryStatus("pending"), "warning");
    assert.equal(badgeVariantForHistoryStatus("failed"), "destructive");
    assert.equal(badgeVariantForHistoryStatus("recorded"), "info");
  });

  it("maps treasury categories", () => {
    assert.equal(badgeVariantForTreasuryCategory("user_payment"), "info");
    assert.equal(badgeVariantForTreasuryCategory("user_payout"), "payout");
    assert.equal(badgeVariantForTreasuryCategory("app_withdrawal"), "destructive");
    assert.equal(badgeVariantForTreasuryCategory("external_in"), "external");
    assert.equal(
      badgeVariantForTreasuryCategory("treasury_outflow_untracked"),
      "neutral"
    );
    assert.equal(
      badgeVariantForTreasuryCategory("wallet_match_unconfirmed"),
      "warning"
    );
  });

  it("maps classification sources", () => {
    assert.equal(badgeVariantForClassificationSource("app_tx"), "info");
    assert.equal(badgeVariantForClassificationSource("address_only"), "warning");
    assert.equal(badgeVariantForClassificationSource("external"), "external");
  });

  it("maps ledger event kinds", () => {
    assert.equal(badgeVariantForLedgerEventKind("subscription"), "info");
    assert.equal(badgeVariantForLedgerEventKind("payout"), "payout");
    assert.equal(badgeVariantForLedgerEventKind("surplus_payout"), "surplus");
  });

  it("maps investment and payout statuses", () => {
    assert.equal(badgeVariantForInvestmentStatus("active"), "info");
    assert.equal(badgeVariantForInvestmentStatus("matured"), "warning");
    assert.equal(badgeVariantForInvestmentStatus("redeemed"), "success");
    assert.equal(badgeVariantForPayoutStatus("paid"), "success");
    assert.equal(badgeVariantForPayoutStatus("paid_surplus"), "surplus");
    assert.equal(badgeVariantForPayoutStatus("paying_surplus"), "surplus");
    assert.equal(badgeVariantForPayoutStatus("ready"), "payout");
    assert.equal(badgeVariantForSurplusPayoutStatus("available"), "surplus");
    assert.equal(badgeVariantForWithdrawalSync(true), "success");
    assert.equal(badgeVariantForWithdrawalSync(false), "warning");
  });
});
