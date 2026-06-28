import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
} from "@prisma/client";
import type { LedgerSnapshot } from "@/services/revenueEngine/ledger";

const INVESTMENT_ID = "507f1f77bcf86cd799439015";
const USER_ID = "507f1f77bcf86cd799439023";

function baseLedgerSnapshot(): LedgerSnapshot {
  return {
    poolAvailable: 100,
    treasurySurplus: 100,
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

describe("broadcastInvestmentPayoutUsdt preflight", () => {
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
    mock.module("@/lib/wallets/helpers", {
      namedExports: {
        getMainWallet: async () => ({ address: "TUserWalletAddress" }),
        getTronscanTxUrl: (txId: string) =>
          `https://shasta.tronscan.org/#/transaction/${txId}`,
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
          amountUsdt: 35,
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
        inspectTransactionOnChain: async () => ({
          txId: "",
          status: "pending",
          usdtTransferSuccessful: false,
          transactionInfo: null,
          transaction: null,
        }),
        transferUsdt: async () => {
          transferCalled = true;
          return { txID: "should-not-broadcast" };
        },
        getTxId: (tx: Record<string, unknown> | null) =>
          typeof tx?.txID === "string" ? tx.txID : null,
      },
    });
    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          investment: {
            findUnique: async () => ({
              id: INVESTMENT_ID,
              userId: USER_ID,
              fundId: "fund-1",
              status: InvestmentStatus.redeeming,
              projectedPayoutUsdt: 35,
              payoutTriggeredBy: "admin",
              payoutUnlockedAt: new Date(),
              maturesAt: new Date(),
              redemptionTransaction: null,
              payoutFailureReason: null,
              payabilityStatus: InvestmentPayabilityStatus.not_matured,
            }),
          },
          treasuryEvent: {
            findFirst: async () => null,
          },
        },
      },
    });

    const { broadcastInvestmentPayoutUsdt } = await import(
      "./investmentPayoutFulfillment"
    );

    await assert.rejects(
      () => broadcastInvestmentPayoutUsdt(INVESTMENT_ID),
      /Not enough test USDT|Treasury cannot cover|insufficient/i
    );
    assert.equal(transferCalled, false);
  });
});
