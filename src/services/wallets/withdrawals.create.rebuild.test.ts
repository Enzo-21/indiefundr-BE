import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  WithdrawalOrderStatus,
  WithdrawalOrderStep,
} from "@prisma/client";

const userId = "user-rebuild";
const walletId = "wallet-main";
const walletAddress = "TArjbXnrL5qTZo6YrT1GzbKHYa3bJSj6Yr";
const destAddress = "TDestWalletAddress1234567890123456";
const now = new Date();

function buildCreatedOrder(amount: number) {
  return {
    id: "withdraw-rebuild",
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

describe("createWithdrawalOrder when rebuildWalletActivity fails", () => {
  it("still returns 202 after the order is persisted", async () => {
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
        getActiveWithdrawalForUser: async () => null,
        getWalletUsdtAvailability: async () => ({
          onChainUsdt: 100,
          reservedUsdt: 0,
          availableUsdt: 100,
          pendingOrdersCount: 0,
          pendingWithdrawalsCount: 0,
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
    mock.module("@/lib/config/withdrawalSlots", {
      namedExports: {
        WithdrawalSlotsEmptyError: class WithdrawalSlotsEmptyError extends Error {
          code = "WITHDRAWAL_SLOTS_EMPTY";
          earned = 0;
          used = 0;
          available = 0;
        },
        assertCanCreateWithdrawal: async () => ({
          earned: 1,
          used: 0,
          available: 1,
          openWithdrawals: 0,
          completedWithdrawals: 0,
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
      namedExports: {
        rebuildWalletActivity: async () => {
          throw new Error("materializer blew up");
        },
      },
    });
    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          withdrawalOrder: {
            create: async ({ data }: { data: Record<string, unknown> }) =>
              buildCreatedOrder(Number(data.amountUsdt)),
            findUnique: async () => buildCreatedOrder(25),
            update: async () => buildCreatedOrder(25),
          },
        },
      },
    });

    const { createWithdrawalOrder } = await import("./withdrawals");
    const result = await createWithdrawalOrder(userId, {
      amountUsdt: 25,
      destinationAddress: destAddress,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 202);
      assert.equal(result.data.amountUsdt, 25);
    }
  });
});
