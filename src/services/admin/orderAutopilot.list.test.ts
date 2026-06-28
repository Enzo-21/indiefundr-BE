import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

describe("listAutopilotOrderCandidates", () => {
  it("omits referral queue when includeReferral is false", async () => {
    mock.module("@/services/admin/purchaseOrderFulfillment", {
      namedExports: {
        listAdminSubscriptionQueue: async () => [],
      },
    });
    mock.module("@/services/admin/withdrawalOrderFulfillment", {
      namedExports: {
        listAdminWithdrawalQueue: async () => [],
      },
    });
    mock.module("@/services/admin/referralPayoutOrderFulfillment", {
      namedExports: {
        listAdminReferralPayoutQueue: async () => [
          {
            orderType: "referral",
            orderId: "referral-only",
            userId: "user-r",
            userEmail: "referral@example.com",
            userName: "Referral User",
            kind: "invitee_bonus",
            kindLabel: "Invitee bonus",
            referralInviteId: null,
            investmentId: null,
            costUsdt: 5,
            reservedUsdt: 0,
            status: "queued",
            walletAddress: "TWalletR",
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
            normalizedDateIso: "2026-01-01T00:00:00.000Z",
            date: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    const { listAutopilotOrderCandidates } = await import("./orderAutopilot");

    const withoutReferral = await listAutopilotOrderCandidates({
      includeReferral: false,
    });
    assert.deepEqual(withoutReferral, []);

    const withReferral = await listAutopilotOrderCandidates({
      includeReferral: true,
    });
    assert.equal(withReferral.length, 1);
    assert.equal(withReferral[0]?.orderId, "referral-only");
    assert.equal(withReferral[0]?.orderType, "referral");
    assert.equal(withReferral[0]?.kindLabel, "Invitee bonus");
  });
});
