import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  ReferralPayoutOrderKind,
  ReferralPayoutOrderStatus,
} from "@prisma/client";
import type { LedgerSnapshot } from "@/services/revenueEngine/ledger";

const ORDER_ID = "507f1f77bcf86cd799439011";
const WALLET_ID = "507f1f77bcf86cd799439021";

function baseLedgerSnapshot(): LedgerSnapshot {
  return {
    poolAvailable: 100,
    treasurySurplus: 10,
    protectedRevenueCredited: 0,
    protectedRevenueWithdrawn: 0,
    poolLiquidity: 90,
    protectedRevenueAvailable: 0,
    subscriberSlotsCredited: 0,
    subscriberSlotsConsumed: 0,
    subscriberSlotsAvailable: 0,
    version: 1,
  };
}

describe("broadcastReferralPayoutUsdt idempotency", () => {
  it("returns existing tx id when USDT transfer already succeeded", async () => {
    mock.module("@/lib/env", {
      namedExports: {
        getEnv: () => ({
          treasuryPrivateKey: "treasury-private-key",
          indieFundrChainMemoEnabled: false,
        }),
      },
    });
    mock.module("@/services/revenueEngine/ledger", {
      namedExports: {
        getLedgerSnapshot: async () => baseLedgerSnapshot(),
        recordReferralBonusOutflow: async () => ({}),
        recordReferralPrincipalRecovery: async () => ({}),
      },
    });
    mock.module("@/services/tron/client", {
      namedExports: {
        validateAddress: async () => true,
        privateKeyToAddress: async () => "TTreasuryAddress",
        estimateUsdtTransfer: async () => ({
          canTransfer: true,
          hasEnoughUsdt: true,
          hasEnoughTrx: true,
          trxBalance: 100,
          usdtBalance: 100,
          estimatedTrx: 1,
        }),
        inspectTransactionOnChain: async () => ({
          txId: "existing-success-tx",
          status: "success",
          usdtTransferSuccessful: true,
          transactionInfo: { id: "existing-success-tx" },
          transaction: { ret: [{ contractRet: "SUCCESS" }] },
        }),
        transferUsdt: async () => {
          throw new Error("transferUsdt should not be called");
        },
        getTxId: () => "existing-success-tx",
        isUsdtTransferSuccessful: async () => true,
        getTransactionFailureReason: async () => ({
          retryable: false,
          code: "SUCCESS",
          feeTrx: 0,
          message: "",
        }),
      },
    });
    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          referralPayoutOrder: {
            findUnique: async () => ({
              id: ORDER_ID,
              walletId: WALLET_ID,
              amountUsdt: 2,
              kind: ReferralPayoutOrderKind.invitee_bonus,
              status: ReferralPayoutOrderStatus.queued,
              usdtTxId: "existing-success-tx",
            }),
            update: async () => {
              throw new Error("update should not be called");
            },
          },
          wallet: {
            findUnique: async () => ({
              id: WALLET_ID,
              address: "TUserWalletAddress",
            }),
          },
        },
      },
    });

    const { broadcastReferralPayoutUsdt } = await import(
      "./referralPayoutOrderFulfillment"
    );
    const txId = await broadcastReferralPayoutUsdt(ORDER_ID);
    assert.equal(txId, "existing-success-tx");
  });
});
