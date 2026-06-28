import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  InvestmentPayabilityStatus,
  InvestmentStatus,
} from "@prisma/client";

const INVESTMENT_ID = "507f1f77bcf86cd799439016";
const FAILED_TX = "979f62be526a03af13b29c2e3079906f1b2dea674d251ad9dcb47d77a78ab04f";

describe("getInvestmentPayoutWorkflowSeed reconciliation", () => {
  it("clears failed redemption tx and surfaces retry reason", async () => {
    mock.module("@/lib/env", {
      namedExports: {
        getEnv: () => ({
          treasuryPrivateKey: "treasury-private-key",
          indieFundrChainMemoEnabled: false,
        }),
      },
    });
    mock.module("@/lib/wallets/helpers", {
      namedExports: {
        getTronscanTxUrl: (txId: string) =>
          `https://shasta.tronscan.org/#/transaction/${txId}`,
      },
    });

    let redemptionTransaction: Record<string, unknown> | null = {
      txID: FAILED_TX,
    };
    let payoutFailureReason: string | null = null;

    mock.module("@/services/tron/client", {
      namedExports: {
        getTxId: (tx: Record<string, unknown> | null) =>
          typeof tx?.txID === "string" ? tx.txID : null,
        inspectTransactionOnChain: async () => ({
          txId: FAILED_TX,
          status: "failed",
          usdtTransferSuccessful: false,
          transactionInfo: {
            id: FAILED_TX,
            receipt: { result: "REVERT" },
          },
          transaction: { ret: [{ contractRet: "REVERT" }] },
        }),
        getTransactionFailureReason: async () => ({
          retryable: false,
          code: "REVERT",
          feeTrx: 1,
          message: "Treasury USDT balance too low for transfer",
        }),
        validateAddress: async () => true,
        privateKeyToAddress: async () => "TTreasury",
        estimateUsdtTransfer: async () => ({
          canTransfer: true,
          hasEnoughUsdt: true,
          hasEnoughTrx: true,
          trxBalance: 100,
          usdtBalance: 100,
          estimatedTrx: 1,
        }),
      },
    });

    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          investment: {
            findUnique: async () => ({
              status: InvestmentStatus.redeeming,
              payoutTriggeredBy: "admin",
              payoutFailureReason,
              redemptionTransaction,
            }),
            update: async ({ data }: { data: Record<string, unknown> }) => {
              if ("redemptionTransaction" in data) {
                redemptionTransaction =
                  (data.redemptionTransaction as Record<string, unknown> | null) ??
                  null;
              }
              if ("payoutFailureReason" in data) {
                payoutFailureReason =
                  (data.payoutFailureReason as string | null) ?? null;
              }
              return {};
            },
          },
          treasuryEvent: {
            findFirst: async () => null,
          },
        },
      },
    });

    const { getInvestmentPayoutWorkflowSeed } = await import(
      "./investmentPayoutFulfillment"
    );
    const seed = await getInvestmentPayoutWorkflowSeed(INVESTMENT_ID);

    assert.equal(seed.redemptionTxId, null);
    assert.match(
      seed.payoutFailureReason ?? "",
      /Treasury USDT balance too low|failed on-chain/i
    );
    assert.equal(redemptionTransaction, null);
  });
});
