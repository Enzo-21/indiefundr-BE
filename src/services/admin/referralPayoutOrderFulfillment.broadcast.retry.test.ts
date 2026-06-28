import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  ReferralPayoutOrderKind,
  ReferralPayoutOrderStatus,
} from "@prisma/client";
import type { LedgerSnapshot } from "@/services/revenueEngine/ledger";

const SUBTRACTION_OVERFLOW_HEX =
  "536166654d6174683a207375627472616374696f6e206f766572666c6f77";

const ORDER_ID = "507f1f77bcf86cd799439013";
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

describe("broadcastReferralPayoutUsdt retry", () => {
  it("resets failed tx id and rebroadcasts on retry", async () => {
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
      },
    });

    const updates: Array<Record<string, unknown>> = [];
    let usdtTxId: string | null = "failed-tx";
    let status: ReferralPayoutOrderStatus = ReferralPayoutOrderStatus.processing;
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
          txId: "failed-tx",
          status: "failed",
          usdtTransferSuccessful: false,
          transactionInfo: {
            id: "failed-tx",
            receipt: { result: "REVERT" },
            contractResult: SUBTRACTION_OVERFLOW_HEX,
          },
          transaction: { ret: [{ contractRet: "REVERT" }] },
        }),
        transferUsdt: async () => ({ txID: "new-success-tx" }),
        getTxId: () => "new-success-tx",
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
              status,
              usdtTxId,
              failureReason: null,
            }),
            update: async ({ data }: { data: Record<string, unknown> }) => {
              if ("usdtTxId" in data) {
                usdtTxId = (data.usdtTxId as string | null) ?? null;
              }
              if (typeof data.status === "string") {
                status = data.status as ReferralPayoutOrderStatus;
              }
              updates.push(data);
              return {};
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
    assert.equal(txId, "new-success-tx");
    assert.equal(updates.length, 2);
    assert.equal(updates[0]?.usdtTxId, null);
    assert.equal(updates[0]?.status, ReferralPayoutOrderStatus.queued);
    assert.equal(updates[1]?.usdtTxId, "new-success-tx");
    assert.equal(updates[1]?.status, ReferralPayoutOrderStatus.processing);
  });
});
