import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const userId = "user-parallel";
const walletId = "wallet-main";
const walletAddress = "TArjbXnrL5qTZo6YrT1GzbKHYa3bJSj6Yr";
const destAddress = "TDestWalletAddress1234567890123456";

describe("createWithdrawalOrder insufficient available balance", () => {
  it("returns 400 with reservation fields (not 409)", async () => {
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
      },
    });
    mock.module("./walletBalance", {
      namedExports: {
        getWalletUsdtAvailability: async () => ({
          onChainUsdt: 90,
          reservedUsdt: 85,
          availableUsdt: 5,
          pendingOrdersCount: 0,
          pendingWithdrawalsCount: 2,
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

    const { createWithdrawalOrder } = await import("./withdrawals");
    const result = await createWithdrawalOrder(userId, {
      amountUsdt: 10,
      destinationAddress: destAddress,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      const body = result.body as Record<string, unknown>;
      assert.equal(body.code, "INSUFFICIENT_USDT");
      assert.equal(body.reservedUsdt, 85);
      assert.equal(body.availableUsdt, 5);
      assert.equal(body.onChainUsdt, 90);
    }
  });
});
