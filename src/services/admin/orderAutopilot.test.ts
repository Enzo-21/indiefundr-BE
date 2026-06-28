import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PurchaseOrderStatus,
  PurchaseOrderStep,
  ReferralPayoutOrderKind,
  ReferralPayoutOrderStatus,
  WithdrawalOrderStatus,
  WithdrawalOrderStep,
} from "@prisma/client";
import type { AdminOrderRow } from "@/services/admin/purchaseOrderFulfillment";
import type { AdminReferralPayoutRow } from "@/services/admin/referralPayoutOrderFulfillment";
import type { AdminWithdrawalRow } from "@/services/admin/withdrawalOrderFulfillment";
import {
  buildAutopilotOrderCandidateFromRow,
  buildAutopilotOrderCandidatesFromReferralRows,
  buildAutopilotOrderCandidatesFromRows,
  mergeAutopilotOrderCandidates,
} from "./orderAutopilot";

const mockInvestmentRow: AdminOrderRow = {
  orderType: "subscribe",
  orderId: "order-1",
  userId: "user-1",
  userEmail: "first@example.com",
  userName: "First User",
  fundId: "growth",
  fundName: "Growth",
  costUsdt: 25,
  reservedUsdt: 25,
  status: PurchaseOrderStatus.queued,
  step: PurchaseOrderStep.awaiting_trx,
  walletAddress: "TWallet1",
  trxBalance: 0,
  usdtBalance: 25,
  balanceReadStatus: "ok",
  estimatedTrx: 15,
  topUpTxId: null,
  usdtTxId: null,
  adminTrxTopUpTxId: null,
  adminUsdtTxId: null,
  adminNotes: null,
  topUpTronscanUrl: null,
  usdtTronscanUrl: null,
  normalizedDateIso: "2026-01-02T00:00:00.000Z",
  date: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const mockWithdrawalRow: AdminWithdrawalRow = {
  orderType: "withdraw",
  orderId: "withdraw-1",
  userId: "user-2",
  userEmail: "second@example.com",
  userName: "Second User",
  fundId: "withdraw",
  fundName: "Withdrawal",
  destinationAddress: "TDestinationAddress1234567890",
  costUsdt: 50,
  reservedUsdt: 50,
  status: WithdrawalOrderStatus.queued,
  step: WithdrawalOrderStep.awaiting_trx,
  walletAddress: "TWallet2",
  trxBalance: 20,
  usdtBalance: 10,
  balanceReadStatus: "read_failed",
  estimatedTrx: 15,
  topUpTxId: "trx-tx-1",
  usdtTxId: null,
  adminTrxTopUpTxId: "trx-tx-1",
  adminUsdtTxId: null,
  adminNotes: null,
  topUpTronscanUrl: "https://tronscan.org/#/transaction/trx-tx-1",
  usdtTronscanUrl: null,
  normalizedDateIso: "2026-01-01T00:00:00.000Z",
  date: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mockReferralRow: AdminReferralPayoutRow = {
  orderType: "referral",
  orderId: "referral-1",
  userId: "user-3",
  userEmail: "third@example.com",
  userName: "Third User",
  kind: ReferralPayoutOrderKind.invitee_bonus,
  kindLabel: "Invitee bonus",
  referralInviteId: "invite-1",
  investmentId: null,
  costUsdt: 10,
  reservedUsdt: 0,
  status: ReferralPayoutOrderStatus.queued,
  walletAddress: "TWallet3",
  trxBalance: null,
  usdtBalance: null,
  balanceReadStatus: "ok",
  estimatedTrx: null,
  topUpTxId: null,
  usdtTxId: null,
  adminTrxTopUpTxId: null,
  adminUsdtTxId: null,
  adminNotes: null,
  topUpTronscanUrl: null,
  usdtTronscanUrl: null,
  normalizedDateIso: "2026-01-03T00:00:00.000Z",
  date: "2026-01-03T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

describe("buildAutopilotOrderCandidatesFromRows", () => {
  it("maps investment queue rows", () => {
    const candidates = buildAutopilotOrderCandidatesFromRows([mockInvestmentRow]);
    assert.equal(candidates.length, 1);
    assert.deepEqual(candidates[0], {
      orderType: "invest",
      orderId: "order-1",
      userEmail: "first@example.com",
      userName: "First User",
      fundName: "Growth",
      costUsdt: 25,
      normalizedDateIso: "2026-01-02T00:00:00.000Z",
      topUpTxId: null,
      topUpTronscanUrl: null,
      usdtTxId: null,
      usdtTronscanUrl: null,
    });
  });

  it("maps withdrawal rows with truncated destination label", () => {
    const candidate = buildAutopilotOrderCandidateFromRow(mockWithdrawalRow);
    assert.equal(candidate.orderType, "withdraw");
    assert.equal(candidate.fundName, "Withdrawal");
    assert.equal(candidate.destinationLabel, "TDestinati…34567890");
    assert.equal(candidate.topUpTxId, "trx-tx-1");
  });

  it("returns empty array for empty input", () => {
    const candidates = buildAutopilotOrderCandidatesFromRows([]);
    assert.deepEqual(candidates, []);
  });
});

describe("buildAutopilotOrderCandidatesFromReferralRows", () => {
  it("maps referral queue rows with kindLabel", () => {
    const candidates = buildAutopilotOrderCandidatesFromReferralRows([
      mockReferralRow,
    ]);
    assert.equal(candidates.length, 1);
    assert.deepEqual(candidates[0], {
      orderType: "referral",
      orderId: "referral-1",
      userEmail: "third@example.com",
      userName: "Third User",
      fundName: "Invitee bonus",
      kindLabel: "Invitee bonus",
      costUsdt: 10,
      normalizedDateIso: "2026-01-03T00:00:00.000Z",
      topUpTxId: null,
      topUpTronscanUrl: null,
      usdtTxId: null,
      usdtTronscanUrl: null,
    });
  });
});

describe("mergeAutopilotOrderCandidates", () => {
  it("sorts investment and withdrawal candidates oldest first", () => {
    const investment = buildAutopilotOrderCandidatesFromRows([mockInvestmentRow]);
    const withdrawal = buildAutopilotOrderCandidatesFromRows([mockWithdrawalRow]);
    const merged = mergeAutopilotOrderCandidates(investment, withdrawal);
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.orderId, "withdraw-1");
    assert.equal(merged[1]?.orderId, "order-1");
  });

  it("sorts investment, withdrawal, and referral candidates oldest first", () => {
    const investment = buildAutopilotOrderCandidatesFromRows([mockInvestmentRow]);
    const withdrawal = buildAutopilotOrderCandidatesFromRows([mockWithdrawalRow]);
    const referral = buildAutopilotOrderCandidatesFromReferralRows([
      mockReferralRow,
    ]);
    const merged = mergeAutopilotOrderCandidates(
      investment,
      withdrawal,
      referral
    );
    assert.equal(merged.length, 3);
    assert.equal(merged[0]?.orderId, "withdraw-1");
    assert.equal(merged[1]?.orderId, "order-1");
    assert.equal(merged[2]?.orderId, "referral-1");
    assert.equal(merged[2]?.orderType, "referral");
    assert.equal(merged[2]?.kindLabel, "Invitee bonus");
  });
});
