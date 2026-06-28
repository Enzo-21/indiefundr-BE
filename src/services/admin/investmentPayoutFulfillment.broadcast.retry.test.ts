import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
} from "@prisma/client";
import type { LedgerSnapshot } from "@/services/revenueEngine/ledger";

const SUBTRACTION_OVERFLOW_HEX =
  "536166654d6174683a207375627472616374696f6e206f766572666c6f77";

const INVESTMENT_ID = "507f1f77bcf86cd799439014";
const USER_ID = "507f1f77bcf86cd799439022";

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

function baseInvestment(overrides: Record<string, unknown> = {}) {
  return {
    id: INVESTMENT_ID,
    userId: USER_ID,
    fundId: "fund-1",
    status: InvestmentStatus.redeeming,
    projectedPayoutUsdt: 35,
    payoutTriggeredBy: "admin",
    payoutUnlockedAt: new Date(),
    maturesAt: new Date(),
    redemptionTransaction: { txID: "failed-tx" },
    payoutFailureReason: null,
    payabilityStatus: InvestmentPayabilityStatus.not_matured,
    ...overrides,
  };
}

describe("broadcastInvestmentPayoutUsdt retry", () => {
  it("resets failed redemption tx and rebroadcasts on retry", async () => {
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
        creditSurplus: async () => undefined,
        drawSurplus: async () => undefined,
      },
    });
    mock.module("@/lib/wallets/helpers", {
      namedExports: {
        getMainWallet: async () => ({ address: "TUserWalletAddress" }),
        getTronscanTxUrl: (txId: string) => `https://shasta.tronscan.org/#/transaction/${txId}`,
      },
    });

    const updates: Array<Record<string, unknown>> = [];
    let redemptionTransaction: Record<string, unknown> | null = {
      txID: "failed-tx",
    };
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
        getTxId: (tx: Record<string, unknown> | null) =>
          typeof tx?.txID === "string" ? tx.txID : null,
      },
    });
    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          investment: {
            findUnique: async () =>
              baseInvestment({ redemptionTransaction }),
            findUniqueOrThrow: async () =>
              baseInvestment({ redemptionTransaction }),
            update: async ({ data }: { data: Record<string, unknown> }) => {
              if ("redemptionTransaction" in data) {
                redemptionTransaction =
                  (data.redemptionTransaction as Record<string, unknown> | null) ??
                  null;
              }
              updates.push(data);
              return baseInvestment({ redemptionTransaction });
            },
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
    const result = await broadcastInvestmentPayoutUsdt(INVESTMENT_ID);
    assert.equal(result.txId, "new-success-tx");
    assert.equal(result.alreadyBroadcast, false);
    assert.equal(updates.length, 2);
    assert.equal(updates[0]?.redemptionTransaction, null);
    assert.equal(
      (updates[1]?.redemptionTransaction as { txID?: string })?.txID,
      "new-success-tx"
    );
  });
});
