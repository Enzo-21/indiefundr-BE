import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  WithdrawalOrderStatus,
  WithdrawalOrderStep,
} from "@prisma/client";

const userId = "user-parallel";
const walletId = "wallet-main";
const walletAddress = "TArjbXnrL5qTZo6YrT1GzbKHYa3bJSj6Yr";
const destAddress = "TDestWalletAddress1234567890123456";
const now = new Date();

const existingActiveOrder = {
  id: "withdraw-existing",
  userId,
  walletId,
  amountUsdt: 80,
  reservedUsdt: 80,
  destinationAddress: destAddress,
  status: WithdrawalOrderStatus.queued,
  step: WithdrawalOrderStep.awaiting_trx,
  date: now,
  updatedAt: now,
};

function buildCreatedOrder(amount: number) {
  return {
    id: "withdraw-new",
    userId,
    walletId,
    amountUsdt: amount,
    reservedUsdt: amount,
    destinationAddress: destAddress,
    status: WithdrawalOrderStatus.queued,
    step: WithdrawalOrderStep.awaiting_trx,
    date: now,
    updatedAt: now,
    adminTrxTopUpTxId: null,
    usdtTxId: null,
    adminUsdtTxId: null,
    failureReason: null,
    paymentChainOutcome: null,
    paymentChainFinal: null,
  };
}

describe("createWithdrawalOrder when another withdrawal is open", () => {
  it("creates a second order when available balance covers the amount", async () => {
    mock.module("@/lib/wallets/helpers", {
      namedExports: {
        getMainWallet: async () => ({
          id: walletId,
          address: walletAddress,
        }),
      },
    });
    mock.module("@/services/tron/client", {
      namedExports: {
        validateAddress: async () => true,
        estimateUsdtTransfer: async () => ({ estimatedTrx: 15 }),
      },
    });
    mock.module("./walletBalance", {
      namedExports: {
        getActiveWithdrawalForUser: async () => existingActiveOrder,
        getWalletUsdtAvailability: async () => ({
          onChainUsdt: 90,
          reservedUsdt: 80,
          availableUsdt: 10,
          pendingOrdersCount: 0,
          pendingWithdrawalsCount: 1,
        }),
      },
    });
    mock.module("./withdrawalDestination", {
      namedExports: {
        validateWithdrawalDestination: async () => ({
          valid: true,
          normalizedAddress: destAddress,
        }),
      },
    });
    mock.module("@/lib/tron/transactionMemo", {
      namedExports: {
        isIndieFundrChainMemoEnabled: () => false,
        buildIndieFundrMemo: () => "memo",
      },
    });
    mock.module("./walletActivityMaterializer", {
      namedExports: { rebuildWalletActivity: async () => {} },
    });
    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          withdrawalOrder: {
            create: async ({ data }: { data: Record<string, unknown> }) =>
              buildCreatedOrder(Number(data.amountUsdt)),
            findUnique: async () => buildCreatedOrder(10),
            update: async () => buildCreatedOrder(10),
          },
        },
      },
    });

    const { createWithdrawalOrder } = await import("./withdrawals");
    const result = await createWithdrawalOrder(userId, {
      amountUsdt: 10,
      destinationAddress: destAddress,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 202);
      assert.equal(result.data.amountUsdt, 10);
    }
  });
});
