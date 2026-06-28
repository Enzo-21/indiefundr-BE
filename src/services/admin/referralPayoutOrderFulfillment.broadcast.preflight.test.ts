import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  ReferralPayoutOrderKind,
  ReferralPayoutOrderStatus,
} from "@prisma/client";
import type { LedgerSnapshot } from "@/services/revenueEngine/ledger";

const ORDER_ID = "507f1f77bcf86cd799439012";
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

describe("broadcastReferralPayoutUsdt preflight", () => {
  it("blocks broadcast when treasury estimate reports insufficient USDT", async () => {
    mock.module("@/lib/env", {
      namedExports: {
        getEnv: () => ({
          treasuryPrivateKey: "treasury-private-key",
          blockchainNetwork: "testnet",
          indieFundrChainMemoEnabled: false,
        }),
      },
    });
    mock.module("@/services/revenueEngine/ledger", {
      namedExports: {
        getLedgerSnapshot: async () => baseLedgerSnapshot(),
      },
    });
    let transferCalled = false;
    mock.module("@/services/tron/client", {
      namedExports: {
        validateAddress: async () => true,
        privateKeyToAddress: async () => "TTreasuryAddress",
        estimateUsdtTransfer: async () => ({
          fromAddress: "TTreasuryAddress",
          toAddress: "TUserWalletAddress",
          amountUsdt: 2,
          energyUsed: 65000,
          energyAvailable: 0,
          energyBillable: 65000,
          energyPriceSun: 420,
          estimatedTrx: 1,
          estimatedTrxBase: 1,
          feeBufferPercent: 15,
          trxBalance: 50,
          usdtBalance: 0,
          hasEnoughTrx: true,
          hasEnoughUsdt: false,
          canTransfer: false,
        }),
        transferUsdt: async () => {
          transferCalled = true;
          return { txID: "should-not-broadcast" };
        },
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
              usdtTxId: null,
            }),
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

    await assert.rejects(
      () => broadcastReferralPayoutUsdt(ORDER_ID),
      /Not enough test USDT|Treasury USDT|insufficient/i
    );
    assert.equal(transferCalled, false);
  });
});
